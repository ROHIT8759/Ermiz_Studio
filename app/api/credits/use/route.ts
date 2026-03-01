import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ensureUser, requireCredits, serializeBalance } from "@/lib/credit";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  amount: z.number().int().positive(),
  reason: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await ensureUser(user.id, user.email ?? undefined);

  const json = await req.json();
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const balance = await requireCredits(user.id, parsed.data.amount);
    return NextResponse.json({ balance: serializeBalance(balance) });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
