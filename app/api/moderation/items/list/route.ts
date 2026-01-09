import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/shared/lib/supabase/admin";
import { createSupabaseRouteClient } from "@/shared/lib/supabase/route";

const QuerySchema = z.object({
  entity_type: z.literal("post").default("post"),
  decision: z.enum(["needs_review", "approved", "blocked"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(50_000).default(0),
});

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    entity_type: url.searchParams.get("entity_type") ?? undefined,
    decision: url.searchParams.get("decision") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid query.", issues: parsed.error.issues }, { status: 422 });
  }

  // Require an authenticated user (the page is private, but the API route is otherwise public).
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

  try {
    const supabase = createSupabaseAdminClient();
    const { entity_type, decision, limit, offset } = parsed.data;

    let q = supabase
      .from("moderation_items")
      .select("*", { count: "exact" })
      .eq("entity_type", entity_type)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);

    if (decision) q = q.eq("decision", decision);

    const { data, error, count } = await q;
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      items: data ?? [],
      count: typeof count === "number" ? count : null,
      limit,
      offset,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Failed." }, { status: 500 });
  }
}


