import { NextResponse } from "next/server";

export const runtime = "nodejs";

class TimeoutError extends Error {
  name = "TimeoutError";
  constructor(message: string) {
    super(message);
  }
}

async function fetchWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: "GET", cache: "no-store", signal: controller.signal });
    return res;
  } catch (e) {
    if (controller.signal.aborted) throw new TimeoutError("timeout");
    throw e;
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

export async function GET() {
  const raw = String(process.env.SELENIUM_HUB_URL || "").trim();
  if (!raw) {
    return NextResponse.json({ ok: true, skipped: true, reason: "SELENIUM_HUB_URL not set" });
  }

  const candidates = hubCandidates(raw);
  const attempts: Array<{ url: string; ok: boolean; status?: number; error?: string }> = [];

  for (const hub of candidates) {
    const base = hub.replace(/\/wd\/hub$/g, "");
    const url = `${base}/status`;
    try {
      const res = await fetchWithTimeout(url, 2500);
      attempts.push({ url, ok: res.ok, status: res.status });
      if (res.ok) {
        return NextResponse.json({ ok: true, warmed: true, url, status: res.status, attempts });
      }
    } catch (e) {
      attempts.push({ url, ok: false, error: e instanceof Error ? e.message : "fetch failed" });
    }
  }

  return NextResponse.json(
    { ok: false, warmed: false, error: "Selenium hub not ready", attempts },
    { status: 503 }
  );
}

