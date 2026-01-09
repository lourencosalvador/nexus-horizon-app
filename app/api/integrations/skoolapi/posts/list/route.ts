import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

const QuerySchema = z.object({
  group_id: z.string().min(1),
  session_id: z.string().min(1),
  page: z.coerce.number().int().min(1).default(1),
  sort_by: z.enum(["newest", "activity"]).default("newest"),
  category_id: z.string().min(1).optional().nullable(),
});

function getBaseUrl() {
  return (process.env.NEXUS_SKOOLAPI_BASE_URL ?? "https://skoolapi.com").replace(/\/+$/g, "");
}

function getSecret() {
  return (process.env.NEXUS_SKOOLAPI_API_SECRET ?? "").trim();
}

export async function GET(req: NextRequest) {
  const secret = getSecret();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "Missing NEXUS_SKOOLAPI_API_SECRET." }, { status: 500 });
  }

  const u = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    group_id: u.searchParams.get("group_id") ?? "",
    session_id: u.searchParams.get("session_id") ?? "",
    page: u.searchParams.get("page") ?? undefined,
    sort_by: (u.searchParams.get("sort_by") ?? undefined) as any,
    category_id: u.searchParams.get("category_id") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid query.", issues: parsed.error.issues }, { status: 422 });
  }

  const baseUrl = getBaseUrl();
  const qp = new URLSearchParams();
  qp.set("group_id", parsed.data.group_id);
  qp.set("session_id", parsed.data.session_id);
  qp.set("page", String(parsed.data.page));
  qp.set("sort_by", parsed.data.sort_by);
  if (parsed.data.category_id) qp.set("category_id", parsed.data.category_id);

  const url = `${baseUrl}/v1/posts/?${qp.toString()}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "x-api-secret": secret,
        accept: "application/json",
      },
      cache: "no-store",
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      // keep json null
    }

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `SkoolAPI error (${res.status}).`, status: res.status, json, textPreview: text.slice(0, 2000) },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, data: json });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Request failed." }, { status: 502 });
  }
}


