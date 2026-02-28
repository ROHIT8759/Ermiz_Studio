import { NextRequest, NextResponse } from "next/server";
import { RuntimeEngine } from "@/lib/runtime/engine";
import { setActiveRuntimeGraphs } from "@/lib/runtime/state";
import { RuntimeStartPayloadSchema } from "@/lib/runtime/validation";

export async function POST(req: NextRequest) {
  let payload: unknown;

  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = RuntimeStartPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_graph_payload",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  setActiveRuntimeGraphs(parsed.data.graphs);
  const engine = new RuntimeEngine(parsed.data.graphs);
  const executionOrder = await engine.start();

  return NextResponse.json({
    ok: true,
    executionOrder,
    totalNodes: executionOrder.length,
  });
}
