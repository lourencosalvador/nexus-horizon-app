import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/shared/lib/supabase/route";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  const res = NextResponse.redirect(new URL("/dashboard", url));
  if (!code) return NextResponse.redirect(new URL("/auth/signin", url));

  const supabase = createSupabaseRouteClient(req, res);
  await supabase.auth.exchangeCodeForSession(code);
  return res;
}


