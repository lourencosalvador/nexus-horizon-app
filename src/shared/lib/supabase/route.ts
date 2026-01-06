import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

function getEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return { url, anon };
}

export function createSupabaseRouteClient(req: NextRequest, res: NextResponse) {
  const env = getEnv();
  if (!env) {
    throw new Error("Missing Supabase env vars");
  }
  const { url, anon } = env;
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (cookies) => {
        for (const c of cookies) res.cookies.set(c.name, c.value, c.options);
      },
    },
  });

  return supabase;
}


