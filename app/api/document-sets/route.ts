import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { ensureUser } from "@/lib/credit";

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
  name: z.string().trim().min(1, "Name is required"),
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

    // Ensure user exists in our DB
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
    const tab = searchParams.get("tab");

    // Validate tab if present
    let parsedTab = undefined;
    if (tab) {
      const result = tabEnum.safeParse(tab);
      if (!result.success) {
        return NextResponse.json(
          { error: "Invalid tab parameter", details: result.error.flatten() },
          { status: 400 }
        );
      }
      parsedTab = result.data;
    }

    const sets = await prisma.documentSet.findMany({
      where: {
        userId: user.id,
        tab: parsedTab,
      },
      include: { documents: true },
      orderBy: { updatedAt: 'desc' }
    });

    return NextResponse.json({ documentSets: sets });
  } catch (error) {
    console.error("GET /api/document-sets error:", error);
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

    const set = await prisma.documentSet.create({
      data: {
        userId: user.id,
        tab: parsed.data.tab,
        name: parsed.data.name,
      },
    });

    return NextResponse.json({ documentSet: set }, { status: 201 });
  } catch (error) {
    console.error("POST /api/document-sets error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
