import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

function getEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return { url, anon };
}

export async function updateSupabaseSession(req: NextRequest) {
  const res = NextResponse.next();
  const env = getEnv();
  if (!env) {
    // Avoid crashing dev/proxy middleware if env isn't loaded yet.
    return { res, user: null };
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { res, user };
}


