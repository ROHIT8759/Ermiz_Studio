import { NextRequest, NextResponse } from "next/server";
import { RuntimeEngine } from "@/lib/runtime/engine";
import { analyzeDesignSystem } from "@/lib/runtime/architecture";
import {
  getActiveRuntimeGraphs,
  getActiveRuntimeGraphsUpdatedAt,
} from "@/lib/runtime/state";

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

const buildRuntimePath = (segments?: string[]): string => {
  if (!segments || segments.length === 0) return "/";
  return `/${segments.map((segment) => decodeURIComponent(segment)).join("/")}`;
};

const parseRequestPayload = async (req: NextRequest): Promise<unknown> => {
  if (req.method === "GET" || req.method === "HEAD") {
    return undefined;
  }

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return undefined;
  }

  return req.json();
};

async function handleRequest(req: NextRequest, ctx: RouteContext) {
  const activeGraphs = getActiveRuntimeGraphs();
  if (!activeGraphs) {
    return NextResponse.json(
      {
        error: "runtime_not_initialized",
        message:
          "No active runtime graph is loaded. Start runtime from Studio Deploy first.",
      },
      { status: 503 },
    );
  }

  const { path } = await ctx.params;
  const runtimePath = buildRuntimePath(path);

  let payload: unknown;
  try {
    payload = await parseRequestPayload(req);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const engine = new RuntimeEngine(activeGraphs);
  const designReport = analyzeDesignSystem(activeGraphs);
  const serviceErrors = designReport.serviceModel.issues.filter(
    (issue) => issue.severity === "error",
  );

  if (serviceErrors.length > 0) {
    return NextResponse.json(
      {
        error: "service_boundary_violation",
        message: "Runtime request blocked by Service Boundary policy violations.",
        issues: serviceErrors,
      },
      { status: 403 },
    );
  }

  let flowResult;
  try {
    flowResult = await engine.executeRestRequest({
      method: req.method,
      path: runtimePath,
      payload,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "runtime_execution_failed",
        message: error instanceof Error ? error.message : "unknown_error",
      },
      { status: 500 },
    );
  }

  if (!flowResult) {
    return NextResponse.json(
      {
        error: "route_not_found",
        method: req.method,
        path: runtimePath,
        activeGraphUpdatedAt: getActiveRuntimeGraphsUpdatedAt(),
      },
      { status: 404 },
    );
  }

  const url = new URL(req.url);
  const debug = url.searchParams.get("debug") === "1";
  if (debug) {
    return NextResponse.json(
      {
        ...flowResult.response.body,
        _runtime: {
          apiNode: flowResult.apiNode,
          finalNode: flowResult.finalNode,
          executionOrder: flowResult.executionOrder,
        },
      },
      { status: flowResult.response.status },
    );
  }

  return NextResponse.json(flowResult.response.body, {
    status: flowResult.response.status,
  });
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  return handleRequest(req, ctx);
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  return handleRequest(req, ctx);
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  return handleRequest(req, ctx);
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  return handleRequest(req, ctx);
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  return handleRequest(req, ctx);
}
