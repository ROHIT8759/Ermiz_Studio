import { expect, APIRequestContext } from "@playwright/test";
import { GraphCollection } from "../../lib/runtime/architecture";
import { PrismaClient } from "@prisma/client";

type RuntimeStartResponse = {
  ok: boolean;
  executionOrder: Array<{ id: string; kind: string; label: string }>;
  totalNodes: number;
};

type RuntimeRunResponse = {
  status: number;
  body: unknown;
};

type TriggerRuntimeEndpointParams = {
  request: APIRequestContext;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  payload?: unknown;
  debug?: boolean;
};

type AssertDatabaseStateParams = {
  prisma: PrismaClient;
  table: string;
  where: Record<string, unknown>;
  exists?: boolean;
  schema?: string;
};

const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

const assertIdentifier = (value: string, field: string): string => {
  if (!IDENTIFIER_RE.test(value)) {
    throw new Error(`Invalid SQL identifier for ${field}: "${value}"`);
  }
  return value;
};

const normalizePath = (path: string): string => {
  if (!path || path === "/") return "/";
  return path.startsWith("/") ? path : `/${path}`;
};

const buildRunPath = (path: string, debug = true): string => {
  const normalized = normalizePath(path);
  const query = debug ? "?debug=1" : "";
  return `/api/run${normalized}${query}`;
};

export const buildMockGraph = (): GraphCollection => ({
  api: {
    nodes: [
      {
        id: "api-mock-health",
        type: "api_rest",
        data: {
          kind: "api_binding",
          id: "api-mock-health",
          label: "Mock Health API",
          protocol: "rest",
          method: "POST",
          route: "/mock/health",
          request: {
            pathParams: [],
            queryParams: [],
            headers: [],
            body: {
              contentType: "application/json",
              schema: [],
            },
          },
          responses: {
            success: {
              statusCode: 200,
              schema: [],
            },
            error: {
              statusCode: 500,
              schema: [],
            },
          },
          security: {
            type: "none",
            scopes: [],
          },
          rateLimit: {
            enabled: false,
            requests: 100,
            window: "minute",
          },
          version: "1.0.0",
          deprecated: false,
          tables: [],
          tableRelationships: [],
          processRef: "process-mock-health",
        },
      },
      {
        id: "process-mock-health",
        type: "process",
        data: {
          kind: "process",
          id: "process-mock-health",
          label: "Mock Health Process",
          processType: "function_block",
          execution: "sync",
          inputs: [],
          outputs: {
            success: [],
            error: [],
          },
          steps: [
            {
              id: "return-health",
              kind: "return",
              config: {
                value: {
                  ok: true,
                  source: "mock-graph",
                },
              },
            },
          ],
        },
      },
    ],
    edges: [
      {
        source: "api-mock-health",
        target: "process-mock-health",
      },
    ],
  },
});

export const deployMockGraph = async (
  request: APIRequestContext,
  graphs: GraphCollection = buildMockGraph(),
): Promise<RuntimeStartResponse> => {
  const response = await request.post("/api/runtime/start", {
    headers: {
      "x-e2e-bypass-auth": "1",
    },
    data: { graphs },
  });

  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as RuntimeStartResponse;
  expect(body.ok).toBeTruthy();
  expect(Array.isArray(body.executionOrder)).toBeTruthy();

  return body;
};

export const triggerRuntimeEndpoint = async ({
  request,
  method = "POST",
  path,
  payload,
  debug = true,
}: TriggerRuntimeEndpointParams): Promise<RuntimeRunResponse> => {
  const response = await request.fetch(buildRunPath(path, debug), {
    method,
    headers: {
      "x-e2e-bypass-auth": "1",
    },
    data: payload,
  });

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = await response.text();
  }

  return {
    status: response.status(),
    body,
  };
};

export const assertDatabaseState = async ({
  prisma,
  table,
  where,
  exists = true,
  schema = "public",
}: AssertDatabaseStateParams): Promise<void> => {
  const safeSchema = assertIdentifier(schema, "schema");
  const safeTable = assertIdentifier(table, "table");
  const whereEntries = Object.entries(where);

  if (whereEntries.length === 0) {
    throw new Error("assertDatabaseState requires at least one where clause");
  }

  const whereParts: string[] = [];
  const values: unknown[] = [];
  let index = 1;

  for (const [key, value] of whereEntries) {
    const safeKey = assertIdentifier(key, `where.${key}`);
    if (value === null) {
      whereParts.push(`"${safeKey}" IS NULL`);
      continue;
    }
    whereParts.push(`"${safeKey}" = $${index}`);
    values.push(value);
    index += 1;
  }

  const sql =
    `SELECT COUNT(*)::int AS "count" ` +
    `FROM "${safeSchema}"."${safeTable}" ` +
    `WHERE ${whereParts.join(" AND ")}`;

  const result = (await prisma.$queryRawUnsafe(sql, ...values)) as Array<{ count: number }>;
  const count = Number(result[0]?.count ?? 0);

  if (exists) {
    expect(count).toBeGreaterThan(0);
  } else {
    expect(count).toBe(0);
  }
};

export const createE2EPrismaClient = (databaseUrl = process.env.DATABASE_URL): PrismaClient => {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for E2E database assertions");
  }

  return new PrismaClient({
    datasources: {
      db: { url: databaseUrl },
    },
  });
};
