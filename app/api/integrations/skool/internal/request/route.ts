import { NextResponse, type NextRequest } from "next/server";
import { decryptString } from "../../_crypto";

type Body = {
  baseUrl?: string;
  encryptedCookie: string;
  path: string;
  method?: "GET" | "POST";
  jsonBody?: unknown;
};

function normalizeBaseUrl(input: string | undefined) {
  const v = (input ?? "").trim();
  if (!v) return "https://www.skool.com";
  const url = v.startsWith("http://") || v.startsWith("https://") ? v : `https://${v}`;
  return url.replace(/\/+$/g, "");
}

function isAllowedBaseUrl(baseUrl: string) {
  try {
    const u = new URL(baseUrl);
    // SSRF guard: only allow skool.com.
    return u.hostname === "www.skool.com" || u.hostname.endsWith(".skool.com") || u.hostname === "skool.com";
  } catch {
    return false;
  }
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
  let body: Body | null = null;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  let baseUrl = normalizeBaseUrl(body.baseUrl);
  let path = (body.path ?? "").trim();

  // Allow passing the full URL from DevTools as `path`.
  if (path.startsWith("http://") || path.startsWith("https://")) {
    try {
      const u = new URL(path);
      baseUrl = `${u.protocol}//${u.host}`;
      path = `${u.pathname}${u.search}`;
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid URL." }, { status: 400 });
    }
  }

  if (!isAllowedBaseUrl(baseUrl)) {
    return NextResponse.json({ ok: false, error: "Invalid baseUrl." }, { status: 400 });
  }

  if (!path.startsWith("/")) {
    return NextResponse.json({ ok: false, error: "Path must start with '/' (or be a full https:// URL)." }, { status: 400 });
  }

  const enc = (body.encryptedCookie ?? "").trim();
  if (!enc) return NextResponse.json({ ok: false, error: "Missing encryptedCookie." }, { status: 400 });

  let cookie: string;
  try {
    cookie = decryptString(enc);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Invalid encryptedCookie." }, { status: 400 });
  }

  const url = `${baseUrl}${path}`;
  const method = (body.method ?? "GET") as "GET" | "POST";

  try {
    const waf = getCookieValue(cookie, "aws-waf-token");
    const headers: Record<string, string> = {
      cookie,
      ...(waf ? { "x-aws-waf-token": waf } : {}),
      origin: "https://www.skool.com",
      referer: "https://www.skool.com/",
      accept: "application/json, text/plain;q=0.9, */*;q=0.8",
      "user-agent": "Mozilla/5.0 (Nexus; Skool Connector)",
    };

    const bodyJson = body.jsonBody;
    const hasBody = method === "POST" && bodyJson !== undefined;
    if (method === "POST") {
      headers["content-type"] = "application/json";
    }

    const res = await fetch(url, {
      method,
      headers,
      body: hasBody ? JSON.stringify(bodyJson) : undefined,
      cache: "no-store",
      redirect: "follow",
    });

    const contentType = res.headers.get("content-type");
    const text = await res.text();

    let json: unknown | undefined = undefined;
    if (contentType?.includes("application/json")) {
      try {
        json = JSON.parse(text);
      } catch {
        // keep as textPreview
      }
    }

    return NextResponse.json({
      ok: true,
      status: res.status,
      contentType,
      json,
      textPreview: json === undefined ? text.slice(0, 20_000) : undefined,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Request failed." }, { status: 502 });
  }
}


