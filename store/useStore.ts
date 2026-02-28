import { create } from "zustand";
import {
  Connection,
  Edge,
  EdgeChange,
  Node,
  NodeChange,
  addEdge,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
  applyNodeChanges,
  applyEdgeChanges,
} from "@xyflow/react";
import { ProcessGraph } from "@/lib/schema/graph";
import {
  NodeData,
  InputField,
  OutputField,
  ProcessStep,
} from "@/lib/schema/node";

export type NodeKind =
  | "process"
  | "database"
  | "queue"
  | "service_boundary"
  | "api_binding"
  | "api_rest"
  | "api_ws"
  | "api_socketio"
  | "api_webrtc"
  | "api_graphql"
  | "api_grpc"
  | "api_sse"
  | "api_webhook"
  | "infra_ec2"
  | "infra_lambda"
  | "infra_eks"
  | "infra_vpc"
  | "infra_s3"
  | "infra_rds"
  | "infra_lb"
  | "infra_hpc"
  | "function_entry";

type GraphPreset = "empty" | "hello_world_api";

type WorkspaceTab =
  | "api"
  | "database"
  | "functions"
  | "agent";

type GraphState = {
  nodes: Node[];
  edges: Edge[];
};

type RFState = {
  activeTab: WorkspaceTab;
  graphs: Record<WorkspaceTab, GraphState>;
  setActiveTab: (tab: WorkspaceTab) => void;
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  updateNodeData: (id: string, data: Partial<NodeData>) => void;
  deleteNode: (id: string) => void;
  addNode: (kind: NodeKind, position?: { x: number; y: number }) => void;
  addInput: (nodeId: string, input: InputField) => void;
  removeInput: (nodeId: string, inputName: string) => void;
  updateInput: (nodeId: string, inputIndex: number, input: InputField) => void;
  updateOutput: (
    nodeId: string,
    outputIndex: number,
    output: OutputField,
    branch: "success" | "error",
  ) => void;
  addOutput: (
    nodeId: string,
    output: OutputField,
    branch: "success" | "error",
  ) => void;
  removeOutput: (
    nodeId: string,
    outputName: string,
    branch: "success" | "error",
  ) => void;
  addStep: (nodeId: string, step: ProcessStep) => void;
  removeStep: (nodeId: string, stepId: string) => void;
  setGraph: (graph: ProcessGraph) => void;
  loadGraphPreset: (preset: GraphPreset) => void;
  exportGraphs: () => Record<WorkspaceTab, GraphState>;
  importGraphs: (graphs: Record<WorkspaceTab, GraphState>) => void;
};

const graphPresets: Record<GraphPreset, { nodes: Node[]; edges: Edge[] }> = {
  empty: {
    nodes: [],
    edges: [],
  },
  hello_world_api: {
    nodes: [
      {
        id: "hello-api",
        type: "api_binding",
        position: { x: 120, y: 120 },
        data: {
          kind: "api_binding",
          id: "helloWorldApi",
          label: "Hello World API",
          protocol: "rest",
          apiType: "openapi",
          method: "GET",
          route: "/api/hello",
          request: {
            pathParams: [],
            queryParams: [],
            headers: [],
            body: { contentType: "application/json", schema: [] },
          },
          responses: {
            success: {
              statusCode: 200,
              schema: [{ name: "message", type: "string" }],
            },
            error: { statusCode: 500, schema: [] },
          },
          security: { type: "none", scopes: [] },
          rateLimit: { enabled: false, requests: 100, window: "minute" },
          version: "v1",
          deprecated: false,
          processRef: "helloWorldProcess",
          description: "Returns a hello world message",
        },
      },
      {
        id: "hello-process",
        type: "process",
        position: { x: 460, y: 120 },
        data: {
          kind: "process",
          id: "helloWorldProcess",
          label: "Function Block",
          processType: "function_block",
          execution: "sync",
          description: "Produces a simple hello-world response",
          inputs: [],
          outputs: {
            success: [{ name: "message", type: "string" }],
            error: [{ name: "message", type: "string" }],
          },
          steps: [{ id: "step1", kind: "ref", ref: "returnHelloWorld" }],
        },
      },
    ],
    edges: [
      {
        id: "hello-edge-api-process",
        source: "hello-api",
        target: "hello-process",
        type: "step",
      },
    ],
  },
};

const cloneGraph = (graph: GraphState): GraphState => ({
  nodes: graph.nodes.map((node) => ({
    ...node,
    data: { ...(node.data as object) },
  })) as Node[],
  edges: graph.edges.map((edge) => ({ ...edge })),
});

const initialGraphs: Record<WorkspaceTab, GraphState> = {
  api: cloneGraph(graphPresets.hello_world_api),
  database: cloneGraph(graphPresets.empty),
  functions: cloneGraph(graphPresets.empty),
  agent: cloneGraph(graphPresets.empty),
};

export const useStore = create<RFState>((set, get) => {
  const updateActiveGraph = (next: Partial<GraphState>) => {
    set((state) => {
      const current = state.graphs[state.activeTab] || { nodes: [], edges: [] };
      const nodes = next.nodes ?? current.nodes;
      const edges = next.edges ?? current.edges;
      return {
        nodes,
        edges,
        graphs: {
          ...state.graphs,
          [state.activeTab]: { nodes, edges },
        },
      };
    });
  };

  return {
    activeTab: "api",
    graphs: initialGraphs,
    nodes: initialGraphs.api.nodes,
    edges: initialGraphs.api.edges,

    setActiveTab: (tab: WorkspaceTab) => {
      set((state) => {
        if (state.activeTab === tab) return {};
        const existingGraph = state.graphs[tab];
        const graph = existingGraph ?? cloneGraph(graphPresets.empty);
        return {
          activeTab: tab,
          graphs: existingGraph
            ? state.graphs
            : { ...state.graphs, [tab]: graph },
          nodes: graph.nodes,
          edges: graph.edges,
        };
      });
    },

    onNodesChange: (changes: NodeChange[]) => {
      updateActiveGraph({ nodes: applyNodeChanges(changes, get().nodes) });
    },

    onEdgesChange: (changes: EdgeChange[]) => {
      updateActiveGraph({ edges: applyEdgeChanges(changes, get().edges) });
    },

    onConnect: (connection: Connection) => {
      updateActiveGraph({ edges: addEdge(connection, get().edges) });
    },

    updateNodeData: (id: string, data: Partial<NodeData>) => {
      updateActiveGraph({
        nodes: get().nodes.map((node) => {
          if (node.id === id) {
            return { ...node, data: { ...node.data, ...data } };
          }
          return node;
        }),
      });
    },

    deleteNode: (id: string) => {
      updateActiveGraph({
        nodes: get().nodes.filter((node) => node.id !== id),
        edges: get().edges.filter(
          (edge) => edge.source !== id && edge.target !== id,
        ),
      });
    },

    addNode: (kind: NodeKind, customPosition?: { x: number; y: number }) => {
      const nodes = get().nodes;
      const activeTab = get().activeTab;
      if (
        activeTab === "functions" &&
        kind !== "process" &&
        kind !== "function_entry" &&
        kind !== "service_boundary"
      ) {
        return;
      }
      if (kind === "process" && activeTab === "api") {
        const existingApiProcess = nodes.find((node) => {
          const nodeData = node.data as NodeData;
          return nodeData.kind === "process";
        });
        if (existingApiProcess) {
          updateActiveGraph({
            nodes: nodes.map((node) => ({
              ...node,
              selected: node.id === existingApiProcess.id,
            })),
          });
          return;
        }
      }

      const id = `node-${Date.now()}`;
      const lastNode = nodes[nodes.length - 1];
      const position =
        customPosition ||
        (lastNode
          ? { x: lastNode.position.x + 50, y: lastNode.position.y + 150 }
          : { x: 200, y: 200 });

      const nodeConfigs: Record<NodeKind, { type: string; data: NodeData }> = {
        process: {
          type: "process",
          data: {
            kind: "process",
            id: `process_${Date.now()}`,
            label: "Function Block",
            processType: "function_block",
            execution: "sync",
            description: "",
            inputs: [],
            outputs: { success: [], error: [] },
            steps: [],
          },
        },
        function_entry: {
          type: "process",
          data: {
            kind: "process",
            id: `fn_${Date.now()}`,
            label: "Start Function",
            processType: "start_function",
            execution: "sync",
            description: "Entry point callable by an API binding",
            inputs: [],
            outputs: { success: [], error: [] },
            steps: [],
          },
        },
        database: {
          type: "database",
          data: {
            kind: "database",
            id: `db_${Date.now()}`,
            label: "New Database",
            dbType: "sql",
            engine: "postgres",
            capabilities: {
              crud: true,
              transactions: false,
              joins: false,
              aggregations: false,
              indexes: true,
              constraints: false,
              pagination: true,
            },
            performance: {
              connectionPool: {
                min: 2,
                max: 20,
                timeout: 30,
              },
              readReplicas: {
                count: 0,
                regions: [],
              },
              caching: {
                enabled: false,
                strategy: "",
                ttl: 300,
              },
              sharding: {
                enabled: false,
                strategy: "",
                partitionKey: "",
              },
            },
            backup: {
              schedule: "",
              retention: {
                days: 7,
                maxVersions: 30,
              },
              pointInTimeRecovery: false,
              multiRegion: {
                enabled: false,
                regions: [],
              },
            },
            costEstimation: {
              storageGb: 0,
              estimatedIOPS: 0,
              backupSizeGb: 0,
              replicaCount: 0,
            },
            security: {
              roles: [],
              encryption: {
                atRest: false,
                inTransit: false,
              },
              network: {
                vpcId: "",
                allowedIPs: [],
              },
              auditLogging: false,
            },
            monitoring: {
              thresholds: {
                cpuPercent: 80,
                memoryPercent: 80,
                connectionCount: 200,
                queryLatencyMs: 250,
              },
              alerts: [],
              slaTargets: {
                uptimePercent: 99.9,
                maxLatencyMs: 300,
              },
            },
            environments: {
              dev: {
                connectionString: "",
                provider: {
                  region: "",
                },
                performanceTier: "small",
                overrides: {
                  enabled: false,
                },
              },
              staging: {
                connectionString: "",
                provider: {
                  region: "",
                },
                performanceTier: "medium",
                overrides: {
                  enabled: false,
                },
              },
              production: {
                connectionString: "",
                provider: {
                  region: "",
                },
                performanceTier: "large",
                overrides: {
                  enabled: false,
                },
              },
            },
            schemas: [],
            tables: [],
            schemaHistory: [],
            queries: [],
            seeds: [],
            migrations: [],
            relationships: [],
            queryWorkbench: {
              query: "",
              ormTarget: "prisma",
              mockRows: 5,
            },
            description: "",
          },
        },
        queue: {
          type: "queue",
          data: {
            kind: "queue",
            id: `queue_${Date.now()}`,
            label: "New Queue",
            delivery: "at_least_once",
            retry: { maxAttempts: 3, backoff: "exponential" },
            deadLetter: true,
            description: "",
          },
        },
        service_boundary: {
          type: "service_boundary",
          data: {
            kind: "service_boundary",
            id: `service_${Date.now()}`,
            label: "Service Boundary",
            description: "",
            apiRefs: [],
            functionRefs: [],
            dataRefs: [],
            computeRef: "",
            communication: {
              allowApiCalls: true,
              allowQueueEvents: true,
              allowEventBus: true,
              allowDirectDbAccess: false,
            },
          },
        },
        api_binding: {
          type: "api_binding",
          data: {
            kind: "api_binding",
            id: `api_${Date.now()}`,
            label: "REST Interface",
            protocol: "rest",
            apiType: "openapi",
            method: "GET",
            route: "/api/resource",
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
                statusCode: 400,
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
            version: "v1",
            deprecated: false,
            processRef: "",
            description: "",
          },
        },
        api_rest: {
          type: "api_binding",
          data: {
            kind: "api_binding",
            id: `api_rest_${Date.now()}`,
            label: "REST Interface",
            protocol: "rest",
            apiType: "openapi",
            method: "GET",
            route: "/api/resource",
            request: {
              pathParams: [],
              queryParams: [],
              headers: [],
              body: { contentType: "application/json", schema: [] },
            },
            responses: {
              success: { statusCode: 200, schema: [] },
              error: { statusCode: 404, schema: [] },
            },
            security: { type: "none", scopes: [] },
            rateLimit: { enabled: false, requests: 100, window: "minute" },
            version: "v1",
            deprecated: false,
            processRef: "",
            description: "",
          },
        },
        api_ws: {
          type: "api_binding",
          data: {
            kind: "api_binding",
            id: `api_ws_${Date.now()}`,
            label: "WS Interface",
            protocol: "ws",
            apiType: "asyncapi",
            instance: {
              protocol: "ws",
              config: {
                endpoint: "/ws/events",
                pingIntervalSec: 20,
                pingTimeoutSec: 10,
                maxMessageSizeKb: 256,
                maxConnections: 5000,
                auth: { type: "none", scopes: [] },
                rateLimit: { enabled: false, requests: 100, window: "minute" },
              },
            },
            version: "v1",
            deprecated: false,
            processRef: "",
            description: "WebSocket interface",
          },
        },
        api_socketio: {
          type: "api_binding",
          data: {
            kind: "api_binding",
            id: `api_socketio_${Date.now()}`,
            label: "Socket.IO Interface",
            protocol: "socket.io",
            apiType: "asyncapi",
            instance: {
              protocol: "socket.io",
              config: {
                endpoint: "/socket.io",
                namespaces: ["/"],
                rooms: [],
                events: [],
                ackTimeoutMs: 5000,
                auth: { type: "none", scopes: [] },
                rateLimit: { enabled: false, requests: 100, window: "minute" },
              },
            },
            version: "v1",
            deprecated: false,
            processRef: "",
            description: "Socket.IO interface",
          },
        },
        api_webrtc: {
          type: "api_binding",
          data: {
            kind: "api_binding",
            id: `api_webrtc_${Date.now()}`,
            label: "WebRTC Interface",
            protocol: "webrtc",
            apiType: "asyncapi",
            instance: {
              protocol: "webrtc",
              config: {
                signalingTransportRef: "api_ws_signaling",
                stunServers: ["stun:stun.l.google.com:19302"],
                turnServers: [],
                peerLimit: 4,
                topology: "p2p",
              },
            },
            version: "v1",
            deprecated: false,
            processRef: "",
            description: "WebRTC interface",
          },
        },
        api_graphql: {
          type: "api_binding",
          data: {
            kind: "api_binding",
            id: `api_graphql_${Date.now()}`,
            label: "GraphQL Interface",
            protocol: "graphql",
            instance: {
              protocol: "graphql",
              config: {
                endpoint: "/graphql",
                schemaSDL: "type Query { health: String! }",
                operations: {
                  queries: true,
                  mutations: true,
                  subscriptions: true,
                },
              },
            },
            version: "v1",
            deprecated: false,
            processRef: "",
            description: "GraphQL interface",
          },
        },
        api_grpc: {
          type: "api_binding",
          data: {
            kind: "api_binding",
            id: `api_grpc_${Date.now()}`,
            label: "gRPC Interface",
            protocol: "grpc",
            instance: {
              protocol: "grpc",
              config: {
                protobufDefinition:
                  "syntax = \"proto3\";\nservice ApiService { rpc Execute (ExecuteRequest) returns (ExecuteResponse); }\nmessage ExecuteRequest { string id = 1; }\nmessage ExecuteResponse { string status = 1; }",
                service: "ApiService",
                rpcMethods: [{ name: "Execute", type: "unary" }],
              },
            },
            version: "v1",
            deprecated: false,
            processRef: "",
            description: "gRPC interface",
          },
        },
        api_sse: {
          type: "api_binding",
          data: {
            kind: "api_binding",
            id: `api_sse_${Date.now()}`,
            label: "SSE Interface",
            protocol: "sse",
            instance: {
              protocol: "sse",
              config: {
                endpoint: "/events",
                eventName: "update",
                retryMs: 5000,
                heartbeatSec: 30,
                direction: "server_to_client",
              },
            },
            version: "v1",
            deprecated: false,
            processRef: "",
            description: "Server-Sent Events interface",
          },
        },
        api_webhook: {
          type: "api_binding",
          data: {
            kind: "api_binding",
            id: `api_webhook_${Date.now()}`,
            label: "Webhook Interface",
            protocol: "webhook",
            instance: {
              protocol: "webhook",
              config: {
                endpoint: "/webhooks/incoming",
                signatureVerification: {
                  enabled: true,
                  headerName: "X-Signature",
                  secretRef: "WEBHOOK_SECRET",
                },
                retryPolicy: {
                  enabled: true,
                  maxAttempts: 5,
                  backoff: "exponential",
                },
              },
            },
            version: "v1",
            deprecated: false,
            processRef: "",
            description: "Incoming webhook callback interface",
          },
        },
      infra_ec2: {
        type: "infra",
        data: {
          kind: "infra",
          id: `infra_ec2_${Date.now()}`,
          label: "EC2 Instance",
          resourceType: "ec2",
          provider: "aws",
          environment: "production",
          region: "us-east-1",
          tags: [],
          description: "",
          config: {
            instanceType: "t3.large",
            ami: "ami-0abcdef1234567890",
            count: 2,
            subnetIds: "subnet-public-a, subnet-public-b",
            securityGroups: "sg-app",
            diskGb: 50,
            autoscalingMin: 2,
            autoscalingMax: 6,
          },
        },
      },
      infra_lambda: {
        type: "infra",
        data: {
          kind: "infra",
          id: `infra_lambda_${Date.now()}`,
          label: "Lambda Function",
          resourceType: "lambda",
          provider: "aws",
          environment: "production",
          region: "us-east-1",
          tags: [],
          description: "",
          config: {
            runtime: "nodejs20.x",
            memoryMb: 1024,
            timeoutSec: 30,
            handler: "handler.main",
            source: "s3://ermiz-artifacts/functions.zip",
            trigger: "API Gateway",
            environmentVars: "NODE_ENV=production",
          },
        },
      },
      infra_eks: {
        type: "infra",
        data: {
          kind: "infra",
          id: `infra_eks_${Date.now()}`,
          label: "EKS Cluster",
          resourceType: "eks",
          provider: "aws",
          environment: "production",
          region: "us-east-1",
          tags: [],
          description: "",
          config: {
            version: "1.30",
            nodeType: "m6i.large",
            nodeCount: 3,
            minNodes: 3,
            maxNodes: 12,
            vpcId: "vpc-main",
            privateSubnets: "subnet-private-a, subnet-private-b",
            clusterLogs: "api,audit,authenticator",
          },
        },
      },
      infra_vpc: {
        type: "infra",
        data: {
          kind: "infra",
          id: `infra_vpc_${Date.now()}`,
          label: "VPC Network",
          resourceType: "vpc",
          provider: "aws",
          environment: "production",
          region: "us-east-1",
          tags: [],
          description: "",
          config: {
            cidr: "10.0.0.0/16",
            publicSubnets: "10.0.1.0/24, 10.0.2.0/24",
            privateSubnets: "10.0.11.0/24, 10.0.12.0/24",
            natGateways: 2,
            flowLogs: true,
          },
        },
      },
      infra_s3: {
        type: "infra",
        data: {
          kind: "infra",
          id: `infra_s3_${Date.now()}`,
          label: "S3 Bucket",
          resourceType: "s3",
          provider: "aws",
          environment: "production",
          region: "us-east-1",
          tags: [],
          description: "",
          config: {
            bucketName: "ermiz-assets-prod",
            versioning: true,
            encryption: "SSE-S3",
            lifecycle: "archive after 30d",
            publicAccess: "blocked",
          },
        },
      },
      infra_rds: {
        type: "infra",
        data: {
          kind: "infra",
          id: `infra_rds_${Date.now()}`,
          label: "RDS Instance",
          resourceType: "rds",
          provider: "aws",
          environment: "production",
          region: "us-east-1",
          tags: [],
          description: "",
          config: {
            engine: "postgres",
            engineVersion: "16",
            instanceClass: "db.t4g.medium",
            storageGb: 100,
            multiAz: true,
            backupRetentionDays: 7,
            subnetGroup: "rds-private",
          },
        },
      },
      infra_lb: {
        type: "infra",
        data: {
          kind: "infra",
          id: `infra_lb_${Date.now()}`,
          label: "Load Balancer",
          resourceType: "load_balancer",
          provider: "aws",
          environment: "production",
          region: "us-east-1",
          tags: [],
          description: "",
          config: {
            lbType: "ALB",
            scheme: "internet-facing",
            listeners: "80 -> 443",
            targetGroup: "api-service",
            healthCheckPath: "/health",
            tlsCertArn: "arn:aws:acm:region:account:certificate/123",
          },
        },
      },
      infra_hpc: {
        type: "infra",
        data: {
          kind: "infra",
          id: `infra_hpc_${Date.now()}`,
          label: "HPC Cluster",
          resourceType: "hpc",
          provider: "aws",
          environment: "production",
          region: "us-east-1",
          tags: [],
          description: "",
          config: {
            scheduler: "slurm",
            instanceType: "c7i.4xlarge",
            nodeCount: 8,
            maxNodes: 32,
            sharedStorage: "efs-hpc",
            queue: "batch-default",
          },
        },
      },
    };

      const config = nodeConfigs[kind];
      const isApiKind = kind === "api_binding" || kind.startsWith("api_");
      let nodeData = { ...(config.data as object) } as NodeData;
      const nextNodes: Node[] = nodes.map((node) => ({ ...node, selected: false }));

      if (activeTab === "api" && isApiKind && nodeData.kind === "api_binding") {
        const existingApiProcessNode = nextNodes.find((node) => {
          const data = node.data as NodeData;
          return data.kind === "process";
        });
        let apiProcessId = "";

        if (existingApiProcessNode) {
          const existingProcessData = existingApiProcessNode.data as NodeData & {
            kind: "process";
            id: string;
          };
          apiProcessId = existingProcessData.id;
        } else {
          apiProcessId = `api_function_${Date.now()}`;
          const placeholderProcessNode = {
            id: `node-${Date.now() + 1}`,
            type: "process",
            position: { x: position.x + 320, y: position.y + 40 },
            data: {
              kind: "process",
              id: apiProcessId,
              label: "API Function Block",
              processType: "function_block",
              execution: "sync",
              description:
                "Attach imports from Functions tab to complete API behavior.",
              inputs: [],
              outputs: { success: [], error: [] },
              steps: [],
            },
          } as Node;
          nextNodes.push(placeholderProcessNode);
        }

        nodeData = {
          ...(nodeData as object),
          processRef: apiProcessId,
        } as NodeData;
      }

      const newNode: Node = {
        id,
        type: config.type,
        position,
        data: nodeData,
        selected: true,
      };

      updateActiveGraph({
        nodes: [...nextNodes, newNode],
      });
    },

    addInput: (nodeId: string, input: InputField) => {
      updateActiveGraph({
        nodes: get().nodes.map((node) => {
          if (node.id === nodeId && node.data.kind === "process") {
            const processData = node.data as NodeData & { kind: "process" };
            return {
              ...node,
              data: {
                ...processData,
                inputs: [...processData.inputs, input],
              },
            };
          }
          return node;
        }),
      });
    },

    removeInput: (nodeId: string, inputName: string) => {
      updateActiveGraph({
        nodes: get().nodes.map((node) => {
          if (node.id === nodeId && node.data.kind === "process") {
            const processData = node.data as NodeData & { kind: "process" };
            return {
              ...node,
              data: {
                ...processData,
                inputs: processData.inputs.filter(
                  (i: InputField) => i.name !== inputName,
                ),
              },
            };
          }
          return node;
        }),
      });
    },

    updateInput: (nodeId: string, inputIndex: number, input: InputField) => {
      updateActiveGraph({
        nodes: get().nodes.map((node) => {
          if (node.id === nodeId && node.data.kind === "process") {
            const processData = node.data as NodeData & { kind: "process" };
            const newInputs = [...processData.inputs];
            newInputs[inputIndex] = input;
            return {
              ...node,
              data: {
                ...processData,
                inputs: newInputs,
              },
            };
          }
          return node;
        }),
      });
    },

    updateOutput: (
      nodeId: string,
      outputIndex: number,
      output: OutputField,
      branch: "success" | "error",
    ) => {
      updateActiveGraph({
        nodes: get().nodes.map((node) => {
          if (node.id === nodeId && node.data.kind === "process") {
            const processData = node.data as NodeData & { kind: "process" };
            const newBranch = [...processData.outputs[branch]];
            newBranch[outputIndex] = output;
            return {
              ...node,
              data: {
                ...processData,
                outputs: {
                  ...processData.outputs,
                  [branch]: newBranch,
                },
              },
            };
          }
          return node;
        }),
      });
    },

    addOutput: (
      nodeId: string,
      output: OutputField,
      branch: "success" | "error",
    ) => {
      updateActiveGraph({
        nodes: get().nodes.map((node) => {
          if (node.id === nodeId && node.data.kind === "process") {
            const processData = node.data as NodeData & { kind: "process" };
            return {
              ...node,
              data: {
                ...processData,
                outputs: {
                  ...processData.outputs,
                  [branch]: [...processData.outputs[branch], output],
                },
              },
            };
          }
          return node;
        }),
      });
    },

    removeOutput: (
      nodeId: string,
      outputName: string,
      branch: "success" | "error",
    ) => {
      updateActiveGraph({
        nodes: get().nodes.map((node) => {
          if (node.id === nodeId && node.data.kind === "process") {
            const processData = node.data as NodeData & { kind: "process" };
            return {
              ...node,
              data: {
                ...processData,
                outputs: {
                  ...processData.outputs,
                  [branch]: processData.outputs[branch].filter(
                    (o: OutputField) => o.name !== outputName,
                  ),
                },
              },
            };
          }
          return node;
        }),
      });
    },

    addStep: (nodeId: string, step: ProcessStep) => {
      updateActiveGraph({
        nodes: get().nodes.map((node) => {
          if (node.id === nodeId && node.data.kind === "process") {
            const processData = node.data as NodeData & { kind: "process" };
            return {
              ...node,
              data: {
                ...processData,
                steps: [...processData.steps, step],
              },
            };
          }
          return node;
        }),
      });
    },

    removeStep: (nodeId: string, stepId: string) => {
      updateActiveGraph({
        nodes: get().nodes.map((node) => {
          if (node.id === nodeId && node.data.kind === "process") {
            const processData = node.data as NodeData & { kind: "process" };
            return {
              ...node,
              data: {
                ...processData,
                steps: processData.steps.filter(
                  (s: ProcessStep) => s.id !== stepId,
                ),
              },
            };
          }
          return node;
        }),
      });
    },

    setGraph: (graph: ProcessGraph) => {
      updateActiveGraph({
        nodes: graph.nodes as unknown as Node[],
        edges: graph.edges as unknown as Edge[],
      });
    },

    loadGraphPreset: (preset: GraphPreset) => {
      const selectedPreset = graphPresets[preset];
      const graph = cloneGraph(selectedPreset);
      updateActiveGraph({
        nodes: graph.nodes,
        edges: graph.edges,
      });
    },

    exportGraphs: () => get().graphs,

    importGraphs: (graphs: Record<WorkspaceTab, GraphState>) => {
      const activeTab = get().activeTab;
      const currentGraph = graphs[activeTab] ?? cloneGraph(graphPresets.empty);
      set({
        graphs,
        nodes: currentGraph.nodes,
        edges: currentGraph.edges,
      });
    },
  };
});
