import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/shared/lib/supabase/route";

export async function POST(req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  const supabase = createSupabaseRouteClient(req, res);
  await supabase.auth.signOut();
  return res;
}


