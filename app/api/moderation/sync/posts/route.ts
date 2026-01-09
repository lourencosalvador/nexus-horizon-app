import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/shared/lib/supabase/admin";
import { createSupabaseRouteClient } from "@/shared/lib/supabase/route";

const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(50).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(30),
  sort_by: z.enum(["newest", "activity"]).default("newest"),
  group_id: z.string().min(1).optional(),
  session_id: z.string().min(1).optional(),
});

function getSkoolApiBaseUrl() {
  return (process.env.NEXUS_SKOOLAPI_BASE_URL ?? "https://skoolapi.com").replace(/\/+$/g, "");
}

function getSkoolApiSecret() {
  return (process.env.NEXUS_SKOOLAPI_API_SECRET ?? "").trim();
}

function getSkoolApiDefaults() {
  const groupId = (process.env.NEXUS_SKOOLAPI_GROUP_ID ?? "").trim();
  const sessionId = (process.env.NEXUS_SKOOLAPI_SESSION_ID ?? "").trim();
  return { groupId, sessionId };
}

type SkoolApiPost = {
  id?: string;
  title?: string | null;
  content?: string | null;
  created_at?: string | null;
  category?: { id?: string | null; name?: string | null } | string | null;
  author?: {
    id?: string | null;
    username?: string | null;
    first_name?: string | null;
    last_name?: string | null;
  } | null;
};

function coercePosts(json: unknown): SkoolApiPost[] {
  if (Array.isArray(json)) return json as SkoolApiPost[];
  if (!json || typeof json !== "object") return [];
  const anyJson = json as any;
  const candidates = [anyJson.data, anyJson.posts, anyJson.results, anyJson.items];
  for (const c of candidates) {
    if (Array.isArray(c)) return c as SkoolApiPost[];
  }
  return [];
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    page: url.searchParams.get("page") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    sort_by: (url.searchParams.get("sort_by") ?? undefined) as any,
    group_id: url.searchParams.get("group_id") ?? undefined,
    session_id: url.searchParams.get("session_id") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid query.", issues: parsed.error.issues }, { status: 422 });
  }

  // Require an authenticated user.
  const authRes = NextResponse.json({ ok: false });
  try {
    const supabaseAuth = createSupabaseRouteClient(req, authRes);
    const { data, error } = await supabaseAuth.auth.getUser();
    if (error || !data.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Auth not configured." }, { status: 500 });
  }

  const secret = getSkoolApiSecret();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "Missing NEXUS_SKOOLAPI_API_SECRET." }, { status: 500 });
  }

  const envDefaults = getSkoolApiDefaults();
  const groupId = parsed.data.group_id ?? envDefaults.groupId;
  const sessionId = parsed.data.session_id ?? envDefaults.sessionId;
  if (!groupId || !sessionId) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Missing SkoolAPI identifiers. Provide group_id/session_id or set NEXUS_SKOOLAPI_GROUP_ID and NEXUS_SKOOLAPI_SESSION_ID on the server.",
      },
      { status: 500 }
    );
  }

  const baseUrl = getSkoolApiBaseUrl();
  const qp = new URLSearchParams();
  qp.set("group_id", groupId);
  qp.set("session_id", sessionId);
  qp.set("page", String(parsed.data.page));
  qp.set("sort_by", parsed.data.sort_by);
  const skoolUrl = `${baseUrl}/v1/posts/?${qp.toString()}`;

  let json: unknown = null;
  try {
    const res = await fetch(skoolUrl, {
      method: "GET",
      headers: { "x-api-secret": secret, accept: "application/json" },
      cache: "no-store",
    });
    const text = await res.text();
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `SkoolAPI error (${res.status}).`, status: res.status, textPreview: text.slice(0, 2000) },
        { status: 502 }
      );
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Request failed." }, { status: 502 });
  }

  const posts = coercePosts(json).slice(0, parsed.data.limit);
  if (posts.length === 0) {
    return NextResponse.json({ ok: true, synced: 0, flagged: 0, approved: 0, blocked: 0 });
  }

  // Reuse the existing batch analyzer (it also persists to Supabase).
  const origin = url.origin;
  try {
    const batchRes = await fetch(`${origin}/api/moderation/analyze/posts/batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: req.headers.get("cookie") ?? "",
      },
      body: JSON.stringify({
        posts: posts
          .map((p) => {
            const id = String(p.id ?? "").trim();
            const content = String(p.content ?? "").trim();
            if (!id || !content) return null;
            const categoryObj = p.category && typeof p.category === "object" ? (p.category as any) : null;
            const categoryName = typeof p.category === "string" ? p.category : categoryObj?.name ?? null;
            const categoryId = categoryObj?.id ?? null;
            return {
              id,
              title: p.title ?? null,
              content,
              group_id: groupId,
              category_id: categoryId,
              category_name: categoryName,
              created_at: p.created_at ?? null,
              author: p.author
                ? {
                    id: String((p.author as any)?.id ?? "unknown"),
                    username: (p.author as any)?.username ?? null,
                    first_name: (p.author as any)?.first_name ?? null,
                    last_name: (p.author as any)?.last_name ?? null,
                  }
                : null,
            };
          })
          .filter(Boolean),
      }),
    });

    const bj = (await batchRes.json().catch(() => null)) as any;
    if (!batchRes.ok || !bj || bj.ok !== true) {
      return NextResponse.json({ ok: false, error: bj?.error || "Batch analyze failed." }, { status: 500 });
    }

    const results = Array.isArray(bj.results) ? bj.results : [];
    let flagged = 0;
    let approved = 0;
    let blocked = 0;
    for (const r of results) {
      const d = r?.result?.decision;
      if (d === "needs_review") flagged++;
      else if (d === "approved") approved++;
      else if (d === "blocked") blocked++;
    }
    return NextResponse.json({
      ok: true,
      synced: results.length,
      flagged,
      approved,
      blocked,
      persisted: Boolean(bj.persisted),
    });
  } catch (e) {
    // If we can't call the batch route for some reason, return a clear error.
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Sync failed." }, { status: 500 });
  }
}


