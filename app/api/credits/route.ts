import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { prisma } from "@/lib/prisma";
import { ensureUser, refreshMonthlyCredits } from "@/lib/credit";

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await ensureUser(user.id, user.email ?? undefined);
  const balance = await refreshMonthlyCredits(user.id);
  const current = balance ?? (await prisma.creditBalance.findUnique({ where: { userId: user.id } }));

  return NextResponse.json({ balance: current });
}
