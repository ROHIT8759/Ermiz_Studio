import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { ensureUser, requireCredits } from "@/lib/credit";

const tabEnum = z.enum([
  "api",
  "process",
  "infrastructure",
  "schema",
  "requestTab",
  "other",
]);

const createSchema = z.object({
  tab: tabEnum,
  title: z.string().trim().min(1, "Title is required"),
  content: z.unknown(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  documentSetId: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized", details: authError?.message },
        { status: 401 }
      );
    }

    try {
      await ensureUser(user.id, user.email ?? undefined);
    } catch (dbError) {
      console.error("Failed to ensure user:", dbError);
      return NextResponse.json(
        { error: "Database error during user verification" },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const tabParam = searchParams.get("tab");

    let parsedTab = undefined;
    if (tabParam) {
      const result = tabEnum.safeParse(tabParam);
      if (!result.success) {
        return NextResponse.json(
          { error: "Invalid tab parameter", details: result.error.flatten() },
          { status: 400 }
        );
      }
      parsedTab = result.data;
    }

    const documents = await prisma.document.findMany({
      where: {
        userId: user.id,
        tab: parsedTab,
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ documents });
  } catch (error) {
    console.error("GET /api/documents error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized", details: authError?.message },
        { status: 401 }
      );
    }

    try {
      await ensureUser(user.id, user.email ?? undefined);
    } catch (dbError) {
      console.error("Failed to ensure user:", dbError);
      return NextResponse.json(
        { error: "Database error during user verification" },
        { status: 500 }
      );
    }

    let json;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const parsed = createSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    try {
      await requireCredits(user.id, 1);
    } catch (err) {
      return NextResponse.json(
        { error: "Insufficient credits", details: (err as Error).message },
        { status: 402 }
      );
    }

    const doc = await prisma.document.create({
      data: {
        userId: user.id,
        tab: parsed.data.tab,
        title: parsed.data.title,
        content: parsed.data.content as any,
        metadata: parsed.data.metadata as any,
        version: 1,
        documentSetId: parsed.data.documentSetId,
      },
    });

    return NextResponse.json({ document: doc }, { status: 201 });
  } catch (error) {
    console.error("POST /api/documents error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
