import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/shared/lib/supabase/admin";

const BodySchema = z.object({
  entityType: z.literal("post"),
  entityId: z.string().min(1),
  decision: z.enum(["approved", "needs_review", "blocked"]),
});

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
    const supabase = createSupabaseAdminClient();
    const row = {
      entity_type: parsed.data.entityType,
      entity_id: parsed.data.entityId,
      decision: parsed.data.decision,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("moderation_items").upsert(row as any, { onConflict: "entity_type,entity_id" });
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Failed." }, { status: 500 });
  }
}


