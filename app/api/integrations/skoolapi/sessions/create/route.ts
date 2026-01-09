import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

const BodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function getBaseUrl() {
  return (process.env.NEXUS_SKOOLAPI_BASE_URL ?? "https://skoolapi.com").replace(/\/+$/g, "");
}

function getSecret() {
  return (process.env.NEXUS_SKOOLAPI_API_SECRET ?? "").trim();
}

export async function POST(req: NextRequest) {
  const secret = getSecret();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "Missing NEXUS_SKOOLAPI_API_SECRET." }, { status: 500 });
  }

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

  const url = `${getBaseUrl()}/v1/sessions/`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "x-api-secret": secret,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ email: parsed.data.email, password: parsed.data.password }),
      cache: "no-store",
    });

    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }

    if (res.status !== 201) {
      return NextResponse.json(
        { ok: false, error: `SkoolAPI session create failed (${res.status}).`, status: res.status, json, textPreview: text.slice(0, 2000) },
        { status: 502 }
      );
    }

    const id = typeof json?.id === "string" ? json.id : null;
    const status = typeof json?.status === "string" ? json.status : null;
    if (!id) {
      return NextResponse.json({ ok: false, error: "SkoolAPI returned invalid session id." }, { status: 502 });
    }

    return NextResponse.json({ ok: true, sessionId: id, status: status ?? "unknown" });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Request failed." }, { status: 502 });
  }
}


