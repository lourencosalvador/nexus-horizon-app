import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/shared/lib/supabase/admin";
import { createSupabaseRouteClient } from "@/shared/lib/supabase/route";

const QuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(12).default(3),
});

type MonthKey = string; // YYYY-MM

function monthKeyOf(d: Date): MonthKey {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthLabelOf(key: MonthKey): string {
  const [y, m] = key.split("-");
  const d = new Date(Date.UTC(Number(y), Number(m) - 1, 1));
  return d.toLocaleString("en", { month: "short", timeZone: "UTC" });
}

function startOfMonthUtc(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

function addMonthsUtc(d: Date, delta: number) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1, 0, 0, 0, 0));
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({ months: url.searchParams.get("months") ?? undefined });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid query.", issues: parsed.error.issues }, { status: 422 });
  }

  // Require an authenticated user (dashboard is private, but the API route is otherwise public).
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

  const months = parsed.data.months;
  const now = new Date();
  const end = addMonthsUtc(startOfMonthUtc(now), 1); // start of next month
  const start = addMonthsUtc(startOfMonthUtc(now), -(months - 1));

  const monthKeys: MonthKey[] = [];
  for (let i = 0; i < months; i++) {
    monthKeys.push(monthKeyOf(addMonthsUtc(start, i)));
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("moderation_items")
      .select("entity_type,decision,updated_at,created_at")
      .gte("updated_at", start.toISOString())
      .lt("updated_at", end.toISOString())
      .in("entity_type", ["post", "comment"]);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const flaggedByMonth: Record<MonthKey, { posts: number; comments: number }> = Object.fromEntries(
      monthKeys.map((k) => [k, { posts: 0, comments: 0 }])
    ) as any;
    const analyzedByMonth: Record<MonthKey, { posts: number; comments: number }> = Object.fromEntries(
      monthKeys.map((k) => [k, { posts: 0, comments: 0 }])
    ) as any;

    for (const row of data ?? []) {
      const ts = (row as any).updated_at ?? (row as any).created_at ?? null;
      if (!ts) continue;
      const d = new Date(ts);
      const key = monthKeyOf(d);
      if (!flaggedByMonth[key] || !analyzedByMonth[key]) continue;

      const t = (row as any).entity_type;
      const isPost = t === "post";
      const isComment = t === "comment";
      if (!isPost && !isComment) continue;

      if (isPost) analyzedByMonth[key].posts += 1;
      if (isComment) analyzedByMonth[key].comments += 1;

      const decision = (row as any).decision as string | null;
      const isFlagged = decision === "needs_review" || decision === "blocked";
      if (isFlagged) {
        if (isPost) flaggedByMonth[key].posts += 1;
        if (isComment) flaggedByMonth[key].comments += 1;
      }
    }

    const flaggedSeries = monthKeys.map((k) => ({ month: monthLabelOf(k), posts: flaggedByMonth[k].posts, comments: flaggedByMonth[k].comments }));
    const analyzedSeries = monthKeys.map((k) => {
      const posts = analyzedByMonth[k].posts;
      const comments = analyzedByMonth[k].comments;
      return { month: monthLabelOf(k), posts, comments, total: posts + comments };
    });

    return NextResponse.json({
      ok: true,
      range: { start: start.toISOString(), end: end.toISOString() },
      months: monthKeys.map((k) => ({ key: k, label: monthLabelOf(k) })),
      flagged: { series: flaggedSeries },
      analyzed: { series: analyzedSeries },
      note: "Comments will remain 0 until comment ingestion is implemented.",
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Failed." }, { status: 500 });
  }
}


