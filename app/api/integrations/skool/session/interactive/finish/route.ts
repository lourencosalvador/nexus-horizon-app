import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { encryptString } from "../../../_crypto";

export const runtime = "nodejs";

const API2_WARMUP_PATH = "/self/chat-channels?offset=0&limit=1&last=true&unread-only=false";
const API2_BASE = "https://api2.skool.com";

const BodySchema = z.object({
  sessionId: z.string().min(8),
  baseUrl: z.string().min(4).optional(),
});

function buildCookieHeader(cookies: Array<{ name: string; value: string }>) {
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

function hasCookie(cookieHeader: string, name: string) {
  return new RegExp(`(^|;\\s*)${name}=`).test(cookieHeader);
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

async function getCookies(hub: string, sessionId: string) {
  const res = await fetchWithTimeout(`${hub}/session/${encodeURIComponent(sessionId)}/cookie`, {
    method: "GET",
    timeoutMs: 12_000,
  });
  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok || !json) throw new HttpError(502, `Failed to read cookies (${res.status}).`);
  const cookies = (json?.value ?? json) as Array<{ name: string; value: string }>;
  if (!Array.isArray(cookies)) return [];
  return cookies
    .map((c) => ({ name: String(c?.name ?? ""), value: String(c?.value ?? "") }))
    .filter((c) => c.name && c.value);
}

async function nav(hub: string, sessionId: string, url: string) {
  await fetchWithTimeout(`${hub}/session/${encodeURIComponent(sessionId)}/url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
    timeoutMs: 15_000,
  }).catch(() => undefined);
}

async function deleteSession(hub: string, sessionId: string) {
  await fetchWithTimeout(`${hub}/session/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
    timeoutMs: 8000,
  }).catch(() => undefined);
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

  const sessionId = parsed.data.sessionId.trim();

  try {
    const hub = await pickHub();

    // Warm up api2 host to pick up WAF/session-related cookies (best-effort).
    await nav(hub, sessionId, `${API2_BASE}${API2_WARMUP_PATH}`);

    const cookies = await getCookies(hub, sessionId);
    const cookieHeader = buildCookieHeader(cookies);

    if (!cookieHeader || cookieHeader.length < 20) {
      throw new HttpError(401, "Login did not produce a valid session cookie.");
    }
    if (!hasCookie(cookieHeader, "auth_token")) {
      throw new HttpError(
        401,
        "Still no auth_token cookie. Make sure you completed login (and any captcha) in the interactive window, then try again."
      );
    }

    const encryptedCookie = encryptString(cookieHeader);
    await deleteSession(hub, sessionId);

    return NextResponse.json({
      ok: true,
      connector: "selenium-interactive",
      encryptedCookie,
      createdAt: Date.now(),
      note: "Interactive login completed. Session cookies were encrypted server-side.",
    });
  } catch (e) {
    // Do not leak/keep sessions forever if user retries.
    try {
      const hub = await pickHub();
      await deleteSession(hub, sessionId);
    } catch {
      // ignore
    }

    if (e instanceof HttpError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Request failed." }, { status: 500 });
  }
}

