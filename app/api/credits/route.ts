import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureUser, refreshMonthlyCredits, serializeBalance } from "@/lib/credit";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    await ensureUser(user.id, user.email ?? undefined);
    const balance = await refreshMonthlyCredits(user.id);
    const current = balance ?? (await prisma.creditBalance.findUnique({ where: { userId: user.id } }));

    return NextResponse.json({ balance: serializeBalance(current) });
  } catch (err) {
    console.error("[/api/credits] GET error:", err);
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  }
}
