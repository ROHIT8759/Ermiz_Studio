import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Returns a Supabase client for use in Route Handlers (server-side).
 * Reads/writes the auth session from the request cookies so the token
 * is automatically refreshed on every call.
 *
 * Note: `createRouteHandlerClient` from @supabase/auth-helpers-nextjs
 * requires a synchronous cookie accessor. We pass the `cookies` import
 * directly (the factory pattern recommended by the library).
 */
export function getSupabaseServerClient(): SupabaseClient {
  return createRouteHandlerClient({ cookies });
}

