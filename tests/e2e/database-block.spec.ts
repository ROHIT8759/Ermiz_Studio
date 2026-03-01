import { expect, test } from "@playwright/test";
import { GraphCollection } from "../../lib/runtime/architecture";
import {
  createE2EPrismaClient,
  deployMockGraph,
  triggerRuntimeEndpoint,
} from "./helpers";

test.describe("Database Block Runtime", () => {
  test("inserts user via API -> process -> database flow", async ({ request }) => {
    const email = `e2e_${Date.now()}@example.com`;
    const name = "E2E Runtime User";

    const graph: GraphCollection = {
      api: {
        nodes: [
          {
            id: "api_users_create",
            type: "api_rest",
            data: {
              kind: "api_binding",
              id: "api_users_create",
              label: "Create User API",
              protocol: "rest",
              method: "POST",
              route: "/users",
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
              processRef: "process_create_user",
            },
          },
        ],
        edges: [{ source: "api_users_create", target: "process_create_user" }],
      },
      functions: {
        nodes: [
          {
            id: "process_create_user",
            type: "process",
            data: {
              kind: "process",
              id: "process_create_user",
              label: "Create User Process",
              processType: "function_block",
              execution: "sync",
              inputs: [],
              outputs: {
                success: [],
                error: [],
              },
              steps: [
                {
                  id: "db_create_user",
                  kind: "db_operation",
                  ref: "database_users",
                  config: {
                    operation: "create",
                    schema: "public",
                    table: "User",
                  },
                },
                {
                  id: "return_ok",
                  kind: "return",
                  config: {
                    value: {
                      ok: true,
                    },
                  },
                },
              ],
            },
          },
        ],
        edges: [{ source: "process_create_user", target: "database_users" }],
      },
      database: {
        nodes: [
          {
            id: "database_users",
            type: "database",
            data: {
              kind: "database",
              id: "database_users",
              label: "Users DB",
              dbType: "sql",
              capabilities: {
                crud: true,
                transactions: true,
                joins: true,
                aggregations: true,
                indexes: true,
                constraints: true,
                pagination: true,
              },
              schemas: ["public"],
              tables: [
                {
                  name: "User",
                  fields: [],
                },
              ],
            },
          },
        ],
        edges: [],
      },
      deploy: {
        nodes: [
          {
            id: "infra_compute_e2e",
            type: "infra",
            data: {
              kind: "infra",
              id: "infra_compute_e2e",
              label: "E2E Compute",
              provider: "generic",
              environment: "dev",
              region: "local",
              tags: [],
              resourceType: "ec2",
              config: {
                instanceType: "t3.micro",
                ami: "ami-local",
                count: 1,
                subnetIds: "subnet-local",
                securityGroups: "sg-local",
                diskGb: 20,
                autoscalingMin: 1,
                autoscalingMax: 1,
              },
            },
          },
          {
            id: "service_e2e",
            type: "service_boundary",
            data: {
              kind: "service_boundary",
              id: "service_e2e",
              label: "E2E Service",
              apiRefs: ["api_users_create"],
              functionRefs: ["process_create_user"],
              dataRefs: ["database_users"],
              computeRef: "infra_compute_e2e",
              communication: {
                allowApiCalls: true,
                allowQueueEvents: true,
                allowEventBus: true,
                allowDirectDbAccess: false,
              },
            },
          },
        ],
        edges: [],
      },
    };

    await deployMockGraph(request, graph);

    const runtimeResponse = await triggerRuntimeEndpoint({
      request,
      method: "POST",
      path: "/users",
      payload: { email, name },
      debug: true,
    });

    expect(runtimeResponse.status).toBe(200);

    const prisma = createE2EPrismaClient();

    try {
      await prisma.$connect();

      await expect
        .poll(async () => {
          return prisma.user.findUnique({
            where: { email },
            select: { email: true, name: true },
          });
        })
        .not.toBeNull();

      const inserted = await prisma.user.findUnique({
        where: { email },
        select: { email: true, name: true },
      });

      expect(inserted?.email).toBe(email);
      expect(inserted?.name).toBe(name);
    } finally {
      await prisma.user.deleteMany({ where: { email } });
      await prisma.$disconnect();
    }
  });
});
