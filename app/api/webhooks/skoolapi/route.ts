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

const WebhookSchema = z.object({
  type: z.string().optional().nullable(),
  event: z.string().optional().nullable(),
  data: z.any().optional(),
  post: z.any().optional(),
});

function getSecret() {
  return (process.env.NEXUS_SKOOLAPI_WEBHOOK_SECRET ?? "").trim();
}

function isAuthorized(req: NextRequest) {
  const secret = getSecret();
  if (!secret) return false;
  const header = (req.headers.get("x-api-secret") || req.headers.get("x-webhook-secret") || "").trim();
  return header === secret;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const env = WebhookSchema.safeParse(body);
  const candidate = env.success ? (env.data.data ?? env.data.post ?? body) : body;
  const postParsed = PostSchema.safeParse(candidate);
  if (!postParsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid post payload.", issues: postParsed.error.issues }, { status: 422 });
  }

  try {
    const result = await analyzePost(postParsed.data);
    try {
      const supabase = createSupabaseAdminClient();
      const row = {
        entity_type: "post",
        entity_id: postParsed.data.id,
        group_id: postParsed.data.group_id ?? null,
        category_id: postParsed.data.category_id ?? null,
        category_name: postParsed.data.category_name ?? null,
        decision: result.decision,
        confidence: result.confidence,
        reasons: result.reasons,
        signals: result.signals,
        layer: result.layer,
        is_jobs_context: result.isJobsContext,
        model: result.model ?? null,
        raw: { post: postParsed.data, result },
        updated_at: new Date().toISOString(),
      };
      await supabase.from("moderation_items").upsert(row as any, { onConflict: "entity_type,entity_id" });
    } catch {
      // persistence is best-effort (webhook still returns result)
    }
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Failed." }, { status: 500 });
  }
}


