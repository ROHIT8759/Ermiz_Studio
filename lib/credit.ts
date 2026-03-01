import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";

const monthlyFreeCredits = Number(process.env.MONTHLY_FREE_CREDITS ?? 1000);
const monthlyFreeCreditsBigInt = BigInt(process.env.MONTHLY_FREE_CREDITS ?? 1000);
const resetDay =
  Number(process.env.FREE_RESET_DAY_OF_MONTH ?? 1) >= 1 &&
  Number(process.env.FREE_RESET_DAY_OF_MONTH ?? 1) <= 28
    ? Number(process.env.FREE_RESET_DAY_OF_MONTH ?? 1)
    : 1;

/** Convert BigInt fields to numbers for JSON serialization. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeBalance<T extends Record<string, any>>(obj: T | null): T | null {
  if (!obj) return null;
  const out = { ...obj } as Record<string, unknown>;
  for (const key of Object.keys(out)) {
    if (typeof out[key] === "bigint") {
      out[key] = Number(out[key]);
    }
  }
  return out as T;
}

export async function ensureUser(userId: string, email?: string) {
  const user = await prisma.user.upsert({
    where: { id: userId },
    create: {
      id: userId,
      email: email ?? `${userId}@example.com`,
      creditBalance: {
        create: {
          availableCredits: monthlyFreeCreditsBigInt,
          monthlyFreeCredits: monthlyFreeCreditsBigInt,
          freeResetDayOfMonth: resetDay,
          lastResetAt: new Date(),
        },
      },
    },
    update: {},
    include: { creditBalance: true },
  });
  return user;
}

export async function refreshMonthlyCredits(userId: string) {
  const balance = await prisma.creditBalance.findUnique({
    where: { userId },
  });
  if (!balance) return null;

  const now = new Date();
  const last = balance.lastResetAt;

  const needsReset =
    now.getUTCFullYear() > last.getUTCFullYear() ||
    now.getUTCMonth() > last.getUTCMonth() ||
    (now.getUTCMonth() === last.getUTCMonth() && now.getUTCDate() >= resetDay && last.getUTCDate() < resetDay);

  if (!needsReset) return balance;

  const newCredits = balance.availableCredits + BigInt(monthlyFreeCredits);
  const updated = await prisma.creditBalance.update({
    where: { userId },
    data: {
      availableCredits: newCredits,
      lastResetAt: now,
    },
  });

  await prisma.creditTransaction.create({
    data: {
      userId,
      kind: "monthly_free_grant",
      amount: monthlyFreeCreditsBigInt,
      note: `Monthly free credit refresh on day ${resetDay}`,
    },
  });

  return updated;
}

export async function requireCredits(userId: string, amount: number) {
  if (amount <= 0) {
    throw new Error("amount must be positive");
  }

  await refreshMonthlyCredits(userId);

  const balance = await prisma.creditBalance.findUnique({ where: { userId } });
  if (!balance) {
    throw new Error("balance not found");
  }

  if (balance.availableCredits < BigInt(amount)) {
    throw new Error("insufficient credits");
  }

  const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const newBalance = await tx.creditBalance.update({
      where: { userId },
      data: { availableCredits: { decrement: BigInt(amount) } },
    });

    await tx.creditTransaction.create({
      data: {
        userId,
        kind: "usage",
        amount: BigInt(-amount),
        note: "credit consumption",
      },
    });

    return newBalance;
  });

  return updated;
}

export async function addCredits(
  userId: string,
  amount: number,
  kind: "dummy_payment" | "manual_topup" | "refund" = "dummy_payment",
  note?: string,
) {
  if (amount <= 0) {
    throw new Error("amount must be positive");
  }

  const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const newBalance = await tx.creditBalance.upsert({
      where: { userId },
      create: {
        userId,
        availableCredits: BigInt(amount),
        monthlyFreeCredits: monthlyFreeCreditsBigInt,
        freeResetDayOfMonth: resetDay,
        lastResetAt: new Date(),
      },
      update: { availableCredits: { increment: BigInt(amount) } },
    });

    await tx.creditTransaction.create({
      data: { userId, kind, amount: BigInt(amount), note },
    });

    return newBalance;
  });

  return updated;
}
