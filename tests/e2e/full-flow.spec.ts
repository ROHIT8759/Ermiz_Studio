import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { GraphCollection } from "../../lib/runtime/architecture";
import {
  assertDatabaseState,
  createE2EPrismaClient,
  deployMockGraph,
  triggerRuntimeEndpoint,
} from "./helpers";

const TABLE_NAME = "runtime_e2e_full_flow";

const buildFullFlowGraph = (
  databaseUrl: string,
  withCrossServiceViolation: boolean,
): GraphCollection => {
  const graph: GraphCollection = {
    api: {
      nodes: [
        {
          id: "api-orders",
          type: "api_rest",
          data: {
            kind: "api_binding",
            id: "api-orders",
            label: "Orders API",
            protocol: "rest",
            method: "POST",
            route: "/orders/create",
            request: {
              pathParams: [],
              queryParams: [],
              headers: [],
              body: {
                contentType: "application/json",
                schema: [
                  { name: "requestId", type: "string", required: true },
                  { name: "message", type: "string", required: true },
                ],
              },
            },
            responses: {
              success: {
                statusCode: 200,
                schema: [
                  { name: "requestId", type: "string" },
                  { name: "message", type: "string" },
                ],
              },
              error: {
                statusCode: 500,
                schema: [{ name: "error", type: "string" }],
              },
            },
            security: { type: "none", scopes: [] },
            rateLimit: { enabled: false, requests: 100, window: "minute" },
            version: "1.0.0",
            deprecated: false,
            processRef: "process-validate-order",
          },
        },
      ],
      edges: [],
    },
    functions: {
      nodes: [
        {
          id: "process-validate-order",
          type: "process",
          data: {
            kind: "process",
            id: "process-validate-order",
            label: "Validate And Persist Order",
            processType: "function_block",
            execution: "sync",
            inputs: [],
            outputs: {
              success: [
                { name: "requestId", type: "string" },
                { name: "message", type: "string" },
              ],
              error: [{ name: "error", type: "string" }],
            },
            steps: [
              {
                id: "validate-input",
                kind: "condition",
                config: { requiredFields: ["requestId", "message"] },
              },
              {
                id: "write-order",
                kind: "db_operation",
                ref: "db-orders",
                config: {
                  operation: "create",
                  schema: "public",
                  table: TABLE_NAME,
                },
              },
            ],
          },
        },
        {
          id: "service-orders",
          type: "service_boundary",
          data: {
            kind: "service_boundary",
            id: "service-orders",
            label: "Orders Service",
            apiRefs: ["api-orders"],
            functionRefs: ["process-validate-order"],
            dataRefs: ["db-orders"],
            computeRef: "infra-runtime",
            communication: {
              allowApiCalls: true,
              allowQueueEvents: true,
              allowEventBus: true,
              allowDirectDbAccess: false,
            },
          },
        },
        ...(withCrossServiceViolation
          ? [
              {
                id: "service-billing",
                type: "service_boundary",
                data: {
                  kind: "service_boundary",
                  id: "service-billing",
                  label: "Billing Service",
                  apiRefs: [],
                  functionRefs: ["process-validate-order"],
                  dataRefs: [],
                  computeRef: "infra-runtime",
                  communication: {
                    allowApiCalls: true,
                    allowQueueEvents: true,
                    allowEventBus: true,
                    allowDirectDbAccess: false,
                  },
                },
              },
            ]
          : []),
      ],
      edges: [],
    },
    database: {
      nodes: [
        {
          id: "db-orders",
          type: "database",
          data: {
            kind: "database",
            id: "db-orders",
            label: "Orders Database",
            dbType: "sql",
            engine: "postgres",
            capabilities: {
              crud: true,
              transactions: true,
              joins: true,
              aggregations: true,
              indexes: true,
              constraints: true,
              pagination: true,
            },
            environments: {
              dev: {
                connectionString: databaseUrl,
                provider: { region: "local" },
                performanceTier: "small",
                overrides: { enabled: false },
              },
              staging: {
                connectionString: databaseUrl,
                provider: { region: "local" },
                performanceTier: "medium",
                overrides: { enabled: false },
              },
              production: {
                connectionString: databaseUrl,
                provider: { region: "local" },
                performanceTier: "large",
                overrides: { enabled: false },
              },
            },
            schemas: ["public"],
            tables: [
              {
                name: TABLE_NAME,
                fields: [
                  { name: "requestId", type: "string", nullable: false },
                  { name: "message", type: "string", nullable: false },
                ],
              },
            ],
          },
        },
      ],
      edges: [],
    },
    infra: {
      nodes: [
        {
          id: "infra-runtime",
          type: "infra",
          data: {
            kind: "infra",
            id: "infra-runtime",
            label: "Runtime Compute",
            resourceType: "lambda",
            provider: "aws",
            environment: "dev",
            region: "us-east-1",
            tags: [],
            config: {
              runtime: "nodejs20.x",
              memoryMb: 256,
              timeoutSec: 15,
              handler: "index.handler",
              source: "inline",
              trigger: "api",
              environmentVars: "",
            },
          },
        },
      ],
      edges: [],
    },
  };

  return graph;
};

test.describe("Runtime Full Flow", () => {
  test.describe.configure({ mode: "serial" });
  let prisma: PrismaClient | null = null;
  const databaseUrl = process.env.DATABASE_URL || "";

  test.beforeAll(async () => {
    if (!databaseUrl) return;
    prisma = createE2EPrismaClient(databaseUrl);
    await prisma.$connect();
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "public"."${TABLE_NAME}" (` +
        `"requestId" TEXT PRIMARY KEY, ` +
        `"message" TEXT NOT NULL, ` +
        `"createdAt" TIMESTAMPTZ DEFAULT NOW()` +
      `)`,
    );
  });

  test.afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  test("valid request passes through API -> process validation -> DB", async ({ request }) => {
    test.skip(!databaseUrl, "DATABASE_URL is required for DB-backed E2E flow.");
    if (!prisma) throw new Error("Prisma client not initialized");

    const requestId = `req-${Date.now()}`;
    await prisma.$executeRawUnsafe(
      `DELETE FROM "public"."${TABLE_NAME}" WHERE "requestId" = $1`,
      requestId,
    );

    await deployMockGraph(request, buildFullFlowGraph(databaseUrl, false));
    const run = await triggerRuntimeEndpoint({
      request,
      method: "POST",
      path: "/orders/create",
      payload: {
        requestId,
        message: "store this payload",
      },
      debug: true,
    });

    expect(run.status).toBe(200);
    await assertDatabaseState({
      prisma,
      table: TABLE_NAME,
      where: { requestId },
      exists: true,
    });
  });

  test("cross-service ownership violation is blocked by runtime policy", async ({ request }) => {
    await deployMockGraph(request, buildFullFlowGraph(databaseUrl, true));
    const run = await triggerRuntimeEndpoint({
      request,
      method: "POST",
      path: "/orders/create",
      payload: {
        requestId: `violation-${Date.now()}`,
        message: "should fail due to service boundary rule",
      },
      debug: true,
    });

    expect([403, 500]).toContain(run.status);
    if (run.status === 403) {
      expect(run.body).toMatchObject({
        error: "service_boundary_violation",
      });
    }
  });
});
