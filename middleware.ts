import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import { NextRequest, NextResponse } from "next/server";

/**
 * Protects /studio and API routes that require authentication.
 * Unauthenticated users are redirected to /login with a callbackUrl.
 * The Supabase session cookie is also refreshed on every request.
 */
export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  // Refresh session token so it doesn't expire mid-session
  const supabase = createMiddlewareClient({ req, res });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { pathname } = req.nextUrl;

  // Protect the studio workspace
  if (pathname.startsWith("/studio") && !session) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return res;
}

export const config = {
  // Run on studio pages only; API routes handle auth internally
  matcher: ["/studio/:path*"],
};
