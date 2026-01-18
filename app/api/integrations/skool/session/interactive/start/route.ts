import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const BodySchema = z.object({
  baseUrl: z.string().min(4).optional(),
});

function normalizeBaseUrl(input: string | undefined) {
  const v = (input ?? "").trim();
  if (!v) return "https://www.skool.com";
  if (v.startsWith("http://") || v.startsWith("https://")) return v.replace(/\/+$/g, "");
  return `https://${v}`.replace(/\/+$/g, "");
}

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function fetchWithTimeout(url: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const { timeoutMs, ...rest } = init;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs ?? 5000);
  try {
    return await fetch(url, { ...rest, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(t);
  }
}

function hubCandidates(raw: string): string[] {
  const v = String(raw || "").trim().replace(/\/+$/g, "");
  if (!v) return [];
  if (v.endsWith("/wd/hub")) return [v, v.replace(/\/wd\/hub$/g, "")].filter(Boolean);
  return [v, `${v}/wd/hub`];
}

async function pickHub(): Promise<string> {
  const raw = String(process.env.SELENIUM_HUB_URL || "").trim();
  const candidates = hubCandidates(raw);
  if (candidates.length === 0) throw new HttpError(400, "SELENIUM_HUB_URL is not set.");

  for (const hub of candidates) {
    const base = hub.replace(/\/wd\/hub$/g, "");
    try {
      const r = await fetchWithTimeout(`${base}/status`, { method: "GET", timeoutMs: 2500 });
      if (r.ok) return hub;
    } catch {
      // ignore
    }
  }
  throw new HttpError(503, "Selenium hub is not ready yet (cold start/hibernation). Please wait ~60s and try again.");
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid payload.", issues: parsed.error.issues }, { status: 422 });
  }

  try {
    const hub = await pickHub();
    const baseUrl = normalizeBaseUrl(parsed.data.baseUrl);

    // Create a headful Chrome session so the user can solve captcha/WAF if needed.
    const caps = {
      capabilities: {
        alwaysMatch: {
          browserName: "chrome",
          "goog:chromeOptions": {
            args: [
              "--no-sandbox",
              "--disable-dev-shm-usage",
              "--disable-gpu",
              "--window-size=1280,720",
              "--lang=en-US",
              "--disable-infobars",
              "--disable-blink-features=AutomationControlled",
            ],
          },
        },
      },
    };

    const createRes = await fetchWithTimeout(`${hub}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(caps),
      timeoutMs: 12_000,
    });
    const createJson = (await createRes.json().catch(() => null)) as any;
    if (!createRes.ok || !createJson) {
      throw new HttpError(502, `Failed to create Selenium session (${createRes.status}).`);
    }

    const sessionId: string | undefined =
      createJson?.value?.sessionId ?? createJson?.sessionId ?? createJson?.value?.["sessionId"];
    if (!sessionId) throw new HttpError(502, "Could not read Selenium sessionId.");

    // Navigate to login page (best-effort).
    const loginUrl = `${baseUrl}/login`;
    await fetchWithTimeout(`${hub}/session/${encodeURIComponent(sessionId)}/url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: loginUrl }),
      timeoutMs: 12_000,
    }).catch(() => undefined);

    // NOTE: We can only provide a VNC URL if the Render service exposes it.
    // For now we return an optional hint based on SELENIUM_VNC_URL (recommended: https://<render>/vnc/ ).
    const vncUrl = String(process.env.SELENIUM_VNC_URL || "").trim() || null;

    return NextResponse.json({
      ok: true,
      connector: "selenium-interactive",
      sessionId,
      baseUrl,
      loginUrl,
      vncUrl,
      note:
        "Open the VNC URL (if configured) to complete login/captcha, then call /interactive/finish with the sessionId.",
    });
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Request failed." }, { status: 500 });
  }
}

