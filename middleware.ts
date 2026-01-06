import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { updateSupabaseSession } from "./src/shared/lib/supabase/middleware";

const AUTH_ROUTES = ["/auth"];
const PROTECTED_ROUTES = ["/dashboard", "/connect-instance"];

function startsWithAny(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/public")
  ) {
    return NextResponse.next();
  }

  const { res, user } = await updateSupabaseSession(req);
  const isAuthed = Boolean(user);

  if (pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = isAuthed ? "/dashboard" : "/auth/signin";
    return NextResponse.redirect(url);
  }

  if (startsWithAny(pathname, AUTH_ROUTES) && isAuthed) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  if (startsWithAny(pathname, PROTECTED_ROUTES) && !isAuthed) {
    const url = req.nextUrl.clone();
    url.pathname = "/auth/signin";
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};



