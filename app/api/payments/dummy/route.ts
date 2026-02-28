import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { z } from "zod";
import { addCredits, ensureUser } from "@/lib/credit";

const bodySchema = z.object({
  amount: z.number().int().positive(),
  reference: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
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

  const balance = await addCredits(
    user.id,
    parsed.data.amount,
    "dummy_payment",
    parsed.data.reference ?? "dummy payment",
  );

  return NextResponse.json({ balance });
}
