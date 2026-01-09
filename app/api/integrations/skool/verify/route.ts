import { NextResponse, type NextRequest } from "next/server";
import { decryptString } from "../_crypto";

type VerifyBody = {
  baseUrl?: string;
  cookie?: string;
  encryptedCookie?: string;
};

function normalizeBaseUrl(input: string | undefined) {
  const v = (input ?? "").trim();
  if (!v) return "https://www.skool.com";
  if (v.startsWith("http://") || v.startsWith("https://")) return v.replace(/\/+$/g, "");
  return `https://${v}`.replace(/\/+$/g, "");
}

function looksLoggedIn(html: string) {
  const t = html.toLowerCase();
  if (t.includes("log out") || t.includes("logout")) return true;
  if (t.includes("sign in") || t.includes("login")) return false;
  // Unknown markup; don't block the user.
  return null as boolean | null;
}

function getCookieValue(cookieHeader: string, name: string): string | null {
  const parts = cookieHeader.split(";").map((p) => p.trim());
  for (const part of parts) {
    if (!part) continue;
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const k = part.slice(0, eq).trim();
    if (k !== name) continue;
    return part.slice(eq + 1).trim();
  }
  return null;
}

export async function POST(req: NextRequest) {
  let body: VerifyBody | null = null;
  try {
    body = (await req.json()) as VerifyBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const rawCookie = (body.cookie ?? "").trim();
  const enc = (body.encryptedCookie ?? "").trim();
  let cookie = rawCookie;
  if (!cookie && enc) {
    try {
      cookie = decryptString(enc);
    } catch (e) {
      return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Invalid encrypted cookie." }, { status: 400 });
    }
  }
  if (!cookie || cookie.length < 10) {
    return NextResponse.json({ ok: false, error: "Missing cookie." }, { status: 400 });
  }

  const baseUrl = normalizeBaseUrl(body.baseUrl);

  // Best-effort check:
  // - Fetch www homepage HTML and use heuristics (legacy)
  // - Also try api2 internal endpoint (what the chat actually uses)
  try {
    const res = await fetch(baseUrl, {
      method: "GET",
      headers: {
        cookie,
        // Keep it simple; Skool may vary behavior by UA.
        "user-agent": "Mozilla/5.0 (Nexus; Integration Verify)",
      },
      redirect: "follow",
      cache: "no-store",
    });

    const text = await res.text();
    const login = looksLoggedIn(text);

    const waf = getCookieValue(cookie, "aws-waf-token");
    let api2Status: number | null = null;
    let api2LoggedIn: boolean | null = null;
    try {
      const api2Res = await fetch("https://api2.skool.com/self/chat-channels?offset=0&limit=1&last=true&unread-only=false", {
        method: "GET",
        headers: {
          cookie,
          ...(waf ? { "x-aws-waf-token": waf } : {}),
          origin: "https://www.skool.com",
          referer: "https://www.skool.com/",
          accept: "application/json, text/plain;q=0.9, */*;q=0.8",
          "user-agent": "Mozilla/5.0 (Nexus; Integration Verify)",
        },
        cache: "no-store",
        redirect: "follow",
      });
      api2Status = api2Res.status;
      if (api2Res.status === 200) api2LoggedIn = true;
      else if (api2Res.status === 401) api2LoggedIn = false;
      else api2LoggedIn = null;
    } catch {
      api2Status = null;
      api2LoggedIn = null;
    }

    return NextResponse.json({
      ok: true,
      baseUrl,
      status: res.status,
      looksLoggedIn: login,
      api2Status,
      api2LoggedIn,
      note:
        "Best-effort verification: homepage HTML heuristics + api2 internal check (preferred).",
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not reach Skool. Check your network or baseUrl." },
      { status: 502 }
    );
  }
}


