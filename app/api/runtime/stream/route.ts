import { NextRequest, NextResponse } from "next/server";
import { RuntimeEngine } from "@/lib/runtime/engine";
import { setActiveRuntimeGraphs } from "@/lib/runtime/state";
import { RuntimeStartPayloadSchema } from "@/lib/runtime/validation";

const toSseChunk = (event: string, payload: unknown): string =>
  `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;

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
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(toSseChunk(event, data)));
      };

      try {
        send("status", { message: "runtime_started" });

        const engine = new RuntimeEngine(parsed.data.graphs);
        const executionOrder = await engine.start({
          onOrder: (node, index, total) => {
            send("order", {
              index: index + 1,
              total,
              node,
              message: `Order ${index + 1}/${total}: ${node.kind}:${node.label}`,
            });
          },
          onExecute: (node, index, total) => {
            send("execute", {
              index: index + 1,
              total,
              node,
              message: `Executing ${index + 1}/${total}: ${node.kind}:${node.label}`,
            });
          },
        });

        send("complete", {
          executionOrder,
          totalNodes: executionOrder.length,
        });
      } catch (error) {
        send("error", {
          error: "runtime_start_failed",
          message: error instanceof Error ? error.message : "unknown_error",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
