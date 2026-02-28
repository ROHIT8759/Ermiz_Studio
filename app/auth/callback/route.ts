import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const requestUrl = new URL(req.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/";

  const redirectResponse = NextResponse.redirect(new URL(next, requestUrl.origin), { status: 303 });

  if (code) {
    const supabase = createRouteHandlerClient({ cookies });

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const errorUrl = new URL("/login", requestUrl.origin);
      errorUrl.searchParams.set("error", "session_expired");
      errorUrl.searchParams.set("callbackUrl", next);
      return NextResponse.redirect(errorUrl, { status: 303 });
    }
  }

  return redirectResponse;
}
