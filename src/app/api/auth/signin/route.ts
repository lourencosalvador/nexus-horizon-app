import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/shared/lib/supabase/route";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { email?: string; password?: string } | null;
  const email = body?.email?.trim() ?? "";
  const password = body?.password ?? "";

  if (!email || !password) {
    return NextResponse.json({ error: "Missing email or password" }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true });
  const supabase = createSupabaseRouteClient(req, res);

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return res;
}


