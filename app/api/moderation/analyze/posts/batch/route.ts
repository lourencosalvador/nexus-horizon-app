import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { analyzePost } from "@/server/moderation/pipeline";
import { createSupabaseAdminClient } from "@/shared/lib/supabase/admin";

const PostSchema = z.object({
  id: z.string().min(1),
  group_id: z.string().optional().nullable(),
  category_id: z.string().optional().nullable(),
  category_name: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  content: z.string().min(1),
  created_at: z.string().optional().nullable(),
  author: z
    .object({
      id: z.string().min(1),
      username: z.string().optional().nullable(),
      first_name: z.string().optional().nullable(),
      last_name: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
});

const BodySchema = z.object({
  posts: z.array(PostSchema).min(1).max(50),
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

  let supabase: ReturnType<typeof createSupabaseAdminClient> | null = null;
  try {
    supabase = createSupabaseAdminClient();
  } catch {
    supabase = null;
  }

  const results: Array<{ postId: string; ok: boolean; result?: unknown; error?: string }> = [];

  for (const post of parsed.data.posts) {
    try {
      const result = await analyzePost(post);
      results.push({ postId: post.id, ok: true, result });

      if (supabase) {
        const row = {
          entity_type: "post",
          entity_id: post.id,
          group_id: post.group_id ?? null,
          category_id: post.category_id ?? null,
          category_name: post.category_name ?? null,
          decision: result.decision,
          confidence: result.confidence,
          reasons: result.reasons,
          signals: result.signals,
          layer: result.layer,
          is_jobs_context: result.isJobsContext,
          model: result.model ?? null,
          raw: { post, result },
          updated_at: new Date().toISOString(),
        };
        await supabase.from("moderation_items").upsert(row as any, { onConflict: "entity_type,entity_id" });
      }
    } catch (e) {
      results.push({ postId: post.id, ok: false, error: e instanceof Error ? e.message : "Failed." });
    }
  }

  return NextResponse.json({ ok: true, results, persisted: Boolean(supabase) });
}


