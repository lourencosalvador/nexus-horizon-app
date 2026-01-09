import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { analyzePost } from "@/server/moderation/pipeline";

const PostSchema = z.object({
  id: z.string().min(1),
  group_id: z.string().min(1).optional().nullable(),
  category_id: z.string().min(1).optional().nullable(),
  category_name: z.string().min(1).optional().nullable(),
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

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = PostSchema.safeParse((body as any)?.post ?? body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid payload.", issues: parsed.error.issues }, { status: 422 });
  }

  try {
    const result = await analyzePost(parsed.data);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Failed." }, { status: 500 });
  }
}


