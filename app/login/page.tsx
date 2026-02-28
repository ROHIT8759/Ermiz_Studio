"use client";

import { useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabaseClient } from "@/lib/supabase/client";

function LoginContent() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const error = searchParams.get("error") ?? undefined;
  const [localError, setLocalError] = useState<string | null>(null);

  const handleLogin = async () => {
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(callbackUrl)}`;
    const { error: authError } = await supabaseClient.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (authError) {
      setLocalError(authError.message);
    }
  };

  const errorText = useMemo(() => {
    if (localError) return localError;
    if (!error) return null;
    if (error === "session_expired") return "Your session expired. Please sign in again.";
    return "Sign-in required.";
  }, [error, localError]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-black text-white">
      <div className="w-full max-w-md rounded-lg border border-white/10 bg-[#111114] p-8 shadow-lg">
        <h1 className="text-2xl font-semibold mb-4">Sign in</h1>
        <p className="text-sm text-gray-300 mb-6">
          Continue with Google via Supabase. Cookies are HTTP-only and tokens refresh automatically while your refresh token is valid.
        </p>
        <button
          onClick={handleLogin}
          className="w-full rounded-md bg-white text-black py-2 px-4 font-medium hover:bg-gray-200 transition"
        >
          Sign in with Google
        </button>
        {errorText && <p className="mt-4 text-sm text-red-400">{errorText}</p>}
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-black text-white">Loading...</div>}>
      <LoginContent />
    </Suspense>
  );
}
