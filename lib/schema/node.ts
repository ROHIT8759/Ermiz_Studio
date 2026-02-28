import { z } from "zod";

// ============================================
// Basic Types
// ============================================
export const NodeIdSchema = z.string();
export const PositionSchema = z.object({ x: z.number(), y: z.number() });

// ============================================
// Input/Output Field Schema (Supports Complex Types)
// ============================================
export const FieldTypeSchema = z.enum([
  "string",
  "number",
  "boolean",
  "object",
  "array",
  "any",
]);

// Recursive schema for nested properties (object fields)
export type NestedProperty = {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array" | "any";
  required?: boolean;
  description?: string;
  // For object type: nested properties
  properties?: NestedProperty[];
  // For array type: item type
  items?: NestedProperty;
  // For string: validation
  format?: "email" | "uri" | "date" | "date-time" | "uuid" | "regex";
  pattern?: string;
  // For number: constraints
  minimum?: number;
  maximum?: number;
  // For string/array: length constraints
  minLength?: number;
  maxLength?: number;
};

export const NestedPropertySchema: z.ZodType<NestedProperty> = z.lazy(() =>
  z.object({
    name: z.string(),
    type: FieldTypeSchema,
    required: z.boolean().optional(),
    description: z.string().optional(),
    properties: z.array(NestedPropertySchema).optional(),
    items: NestedPropertySchema.optional(),
    format: z
      .enum(["email", "uri", "date", "date-time", "uuid", "regex"])
      .optional(),
    pattern: z.string().optional(),
    minimum: z.number().optional(),
    maximum: z.number().optional(),
    minLength: z.number().optional(),
    maxLength: z.number().optional(),
  }),
);

export const InputFieldSchema = z.object({
  name: z.string(),
  type: FieldTypeSchema,
  required: z.boolean().default(true),
  description: z.string().optional(),
  // For object type: nested properties
  properties: z.array(NestedPropertySchema).optional(),
  // For array type: item type definition
  items: NestedPropertySchema.optional(),
  // For string: validation format
  format: z
    .enum(["email", "uri", "date", "date-time", "uuid", "regex"])
    .optional(),
  pattern: z.string().optional(),
  // For number: constraints
  minimum: z.number().optional(),
  maximum: z.number().optional(),
  // For string/array: length constraints
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
});

export const OutputFieldSchema = z.object({
  name: z.string(),
  type: FieldTypeSchema,
  description: z.string().optional(),
  // For object type: nested properties
  properties: z.array(NestedPropertySchema).optional(),
  // For array type: item type definition
  items: NestedPropertySchema.optional(),
});

// ============================================
// Process Step Types
// ============================================
export const StepKindSchema = z.enum([
  "compute",
  "db_operation",
  "external_call",
  "condition",
  "transform",
  "ref",
  "return",
]);

export const ProcessStepSchema = z.object({
  id: z.string(),
  kind: StepKindSchema,
  description: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  ref: z.string().optional(),
});

// ============================================
// Process Definition (Core Unit)
// ============================================
export const ProcessTypeSchema = z.enum([
  "function_block",
]);

export const ExecutionModeSchema = z.enum([
  "sync",
  "async",
  "scheduled",
  "event_driven",
]);

export const ProcessDefinitionSchema = z.object({
  kind: z.literal("process"),
  id: z.string(),
  label: z.string(),
  processType: ProcessTypeSchema,
  execution: ExecutionModeSchema,
  description: z.string().optional(),
  inputs: z.array(InputFieldSchema).default([]),
  outputs: z
    .object({
      success: z.array(OutputFieldSchema).default([]),
      error: z.array(OutputFieldSchema).default([]),
    })
    .default({ success: [], error: [] }),
  steps: z.array(ProcessStepSchema).default([]),
  schedule: z.string().optional(),
  trigger: z
    .object({
      queue: z.string().optional(),
      event: z.string().optional(),
    })
    .optional(),
  logic: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
  timeout: z.number().int().min(0).optional(),
  retryPolicy: z
    .object({
      maxAttempts: z.number().int().min(1).max(10),
      backoff: z.enum(["fixed", "linear", "exponential"]),
      delayMs: z.number().int().min(0),
    })
    .optional(),
  envVars: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
  tags: z.array(z.string()).optional(),
  returnType: z.string().optional(),
});

// ============================================
// Database Block (Infrastructure)
// ============================================
export const DatabaseTypeSchema = z.enum(["sql", "nosql", "kv", "graph"]);

export const DatabaseCapabilitiesSchema = z.object({
  crud: z.boolean(),
  transactions: z.boolean(),
  joins: z.boolean(),
  aggregations: z.boolean(),
  indexes: z.boolean(),
  constraints: z.boolean(),
  pagination: z.boolean(),
});

export const DatabasePerformanceSchema = z.object({
  connectionPool: z.object({
    min: z.number().default(2),
    max: z.number().default(20),
    timeout: z.number().default(30),
  }),
  readReplicas: z.object({
    count: z.number().default(0),
    regions: z.array(z.string()).default([]),
  }),
  caching: z.object({
    enabled: z.boolean().default(false),
    strategy: z.string().default(""),
    ttl: z.number().default(300),
  }),
  sharding: z.object({
    enabled: z.boolean().default(false),
    strategy: z.string().default(""),
    partitionKey: z.string().default(""),
  }),
});

export const DatabaseBackupSchema = z.object({
  schedule: z.string().default(""),
  retention: z.object({
    days: z.number().default(7),
    maxVersions: z.number().default(30),
  }),
  pointInTimeRecovery: z.boolean().default(false),
  multiRegion: z.object({
    enabled: z.boolean().default(false),
    regions: z.array(z.string()).default([]),
  }),
});

export const DatabaseCostEstimationSchema = z.object({
  storageGb: z.number().default(0),
  estimatedIOPS: z.number().default(0),
  backupSizeGb: z.number().default(0),
  replicaCount: z.number().default(0),
});

export const DatabaseSecuritySchema = z.object({
  roles: z
    .array(
      z.object({
        name: z.string(),
        permissions: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  encryption: z.object({
    atRest: z.boolean().default(false),
    inTransit: z.boolean().default(false),
  }),
  network: z.object({
    vpcId: z.string().default(""),
    allowedIPs: z.array(z.string()).default([]),
  }),
  auditLogging: z.boolean().default(false),
});

export const DatabaseMonitoringSchema = z.object({
  thresholds: z.object({
    cpuPercent: z.number().default(80),
    memoryPercent: z.number().default(80),
    connectionCount: z.number().default(200),
    queryLatencyMs: z.number().default(250),
  }),
  alerts: z
    .array(
      z.object({
        condition: z.string(),
        channel: z.string(),
        recipients: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  slaTargets: z.object({
    uptimePercent: z.number().default(99.9),
    maxLatencyMs: z.number().default(300),
  }),
});

export const DatabaseEnvironmentTierSchema = z.enum([
  "small",
  "medium",
  "large",
]);

export const DatabaseEnvironmentOverrideSchema = z.object({
  enabled: z.boolean().default(false),
  performance: DatabasePerformanceSchema.optional(),
  backup: DatabaseBackupSchema.optional(),
  monitoring: DatabaseMonitoringSchema.optional(),
});

export const DatabaseEnvironmentProviderSchema = z.object({
  region: z.string().default(""),
});

export const DatabaseEnvironmentConfigSchema = z.object({
  connectionString: z.string().default(""),
  provider: DatabaseEnvironmentProviderSchema.default({
    region: "",
  }),
  performanceTier: DatabaseEnvironmentTierSchema.default("small"),
  overrides: DatabaseEnvironmentOverrideSchema.default({
    enabled: false,
  }),
});

export const DatabaseEnvironmentsSchema = z.object({
  dev: DatabaseEnvironmentConfigSchema.default({
    connectionString: "",
    provider: {
      region: "",
    },
    performanceTier: "small",
    overrides: { enabled: false },
  }),
  staging: DatabaseEnvironmentConfigSchema.default({
    connectionString: "",
    provider: {
      region: "",
    },
    performanceTier: "medium",
    overrides: { enabled: false },
  }),
  production: DatabaseEnvironmentConfigSchema.default({
    connectionString: "",
    provider: {
      region: "",
    },
    performanceTier: "large",
    overrides: { enabled: false },
  }),
});

export const DatabaseOrmTargetSchema = z.enum([
  "prisma",
  "typeorm",
  "mongoose",
]);

export const DatabaseFieldTypeSchema = z.enum([
  "string",
  "number",
  "date",
  "text",
  "int",
  "bigint",
  "float",
  "decimal",
  "boolean",
  "datetime",
  "json",
  "uuid",
]);

export const DatabaseRelationTypeSchema = z.enum([
  "one_to_one",
  "one_to_many",
  "many_to_many",
]);

export const DatabaseSchemaChangeTypeSchema = z.enum([
  "table_added",
  "field_added",
  "field_modified",
  "field_removed",
  "table_removed",
]);

export const DatabaseSchemaHistoryEntrySchema = z.object({
  timestamp: z.string(),
  changeType: DatabaseSchemaChangeTypeSchema,
  target: z.string(),
  details: z
    .object({
      before: z.unknown().optional(),
      after: z.unknown().optional(),
    })
    .default({}),
});

export const DatabaseQueryOperationSchema = z.enum([
  "SELECT",
  "INSERT",
  "UPDATE",
  "DELETE",
]);

export const DatabaseQueryComplexitySchema = z.enum([
  "simple",
  "moderate",
  "complex",
]);

export const DatabaseSeedStrategySchema = z.enum([
  "random",
  "fixture",
  "custom",
]);

export const DatabaseQuerySchema = z.object({
  id: z.string(),
  name: z.string(),
  operation: DatabaseQueryOperationSchema,
  target: z.string(),
  conditions: z.string().default(""),
  generatedCode: z.string().default(""),
  estimatedRowsScanned: z.number().optional(),
  usesIndex: z.boolean().optional(),
  complexity: DatabaseQueryComplexitySchema.optional(),
  suggestedIndexes: z.array(z.string()).optional(),
});

export const DatabaseMigrationSchema = z.object({
  version: z.string(),
  timestamp: z.string(),
  description: z.string().default(""),
  upScript: z.string().default(""),
  downScript: z.string().default(""),
  applied: z.boolean().default(false),
});

export const DatabaseSeedSchema = z.object({
  tableName: z.string(),
  rowCount: z.number().default(10),
  strategy: DatabaseSeedStrategySchema.default("random"),
  fixtureData: z.array(z.record(z.string(), z.unknown())).default([]),
  customScript: z.string().default(""),
});

export const DatabaseTableFieldSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  type: DatabaseFieldTypeSchema,
  nullable: z.boolean().optional(),
  defaultValue: z.string().optional(),
  isPrimaryKey: z.boolean().optional(),
  isForeignKey: z.boolean().optional(),
  references: z
    .object({
      table: z.string(),
      field: z.string(),
    })
    .optional(),
  // Legacy fields kept for backward compatibility.
  required: z.boolean().optional(),
  unique: z.boolean().optional(),
  primaryKey: z.boolean().optional(),
});

export const DatabaseTableSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  fields: z.array(DatabaseTableFieldSchema).default([]),
  indexes: z.array(z.string()).optional(),
});

export const DatabaseRelationshipSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  type: DatabaseRelationTypeSchema,
  fromTableId: z.string(),
  toTableId: z.string(),
  fromFieldId: z.string().optional(),
  toFieldId: z.string().optional(),
  onDelete: z.enum(["cascade", "restrict", "set_null", "no_action"]).default("no_action"),
});

export const DatabaseQueryWorkbenchSchema = z.object({
  query: z.string().default(""),
  ormTarget: DatabaseOrmTargetSchema.default("prisma"),
  mockRows: z.number().min(1).max(50).default(5),
});

export const DatabaseBlockSchema = z.object({
  kind: z.literal("database"),
  id: z.string(),
  label: z.string(),
  dbType: DatabaseTypeSchema,
  engine: z.string().optional(),
  capabilities: DatabaseCapabilitiesSchema,
  performance: DatabasePerformanceSchema.default({
    connectionPool: { min: 2, max: 20, timeout: 30 },
    readReplicas: { count: 0, regions: [] },
    caching: { enabled: false, strategy: "", ttl: 300 },
    sharding: { enabled: false, strategy: "", partitionKey: "" },
  }),
  backup: DatabaseBackupSchema.default({
    schedule: "",
    retention: { days: 7, maxVersions: 30 },
    pointInTimeRecovery: false,
    multiRegion: { enabled: false, regions: [] },
  }),
  costEstimation: DatabaseCostEstimationSchema.default({
    storageGb: 0,
    estimatedIOPS: 0,
    backupSizeGb: 0,
    replicaCount: 0,
  }),
  security: DatabaseSecuritySchema.default({
    roles: [],
    encryption: { atRest: false, inTransit: false },
    network: { vpcId: "", allowedIPs: [] },
    auditLogging: false,
  }),
  monitoring: DatabaseMonitoringSchema.default({
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
  }),
  environments: DatabaseEnvironmentsSchema.default({
    dev: {
      connectionString: "",
      provider: {
        region: "",
      },
      performanceTier: "small",
      overrides: { enabled: false },
    },
    staging: {
      connectionString: "",
      provider: {
        region: "",
      },
      performanceTier: "medium",
      overrides: { enabled: false },
    },
    production: {
      connectionString: "",
      provider: {
        region: "",
      },
      performanceTier: "large",
      overrides: { enabled: false },
    },
  }),
  loadedTemplate: z.string().optional(),
  schemas: z.array(z.string()).default([]),
  tables: z.array(DatabaseTableSchema).default([]),
  schemaHistory: z.array(DatabaseSchemaHistoryEntrySchema).default([]),
  queries: z.array(DatabaseQuerySchema).default([]),
  seeds: z.array(DatabaseSeedSchema).default([]),
  migrations: z.array(DatabaseMigrationSchema).default([]),
  relationships: z.array(DatabaseRelationshipSchema).default([]),
  queryWorkbench: DatabaseQueryWorkbenchSchema.default({
    query: "",
    ormTarget: "prisma",
    mockRows: 5,
  }),
  description: z.string().optional(),
});

// ============================================
// Queue Block (Infrastructure)
// ============================================
export const QueueDeliverySchema = z.enum([
  "at_least_once",
  "at_most_once",
  "exactly_once",
]);

export const QueueRetrySchema = z.object({
  maxAttempts: z.number(),
  backoff: z.enum(["linear", "exponential"]),
});

export const QueueBlockSchema = z.object({
  kind: z.literal("queue"),
  id: z.string(),
  label: z.string(),
  delivery: QueueDeliverySchema,
  retry: QueueRetrySchema,
  deadLetter: z.boolean(),
  description: z.string().optional(),
});

// ============================================
// Service Boundary Block (Microservice Ownership)
// ============================================
export const ServiceBoundaryBlockSchema = z.object({
  kind: z.literal("service_boundary"),
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
  apiRefs: z.array(z.string()).default([]),
  functionRefs: z.array(z.string()).default([]),
  dataRefs: z.array(z.string()).default([]),
  computeRef: z.string().optional(),
  communication: z
    .object({
      allowApiCalls: z.boolean().default(true),
      allowQueueEvents: z.boolean().default(true),
      allowEventBus: z.boolean().default(true),
      allowDirectDbAccess: z.boolean().default(false),
    })
    .default({
      allowApiCalls: true,
      allowQueueEvents: true,
      allowEventBus: true,
      allowDirectDbAccess: false,
    }),
});

// ============================================
// Infra Resources (Terraform-aligned)
// ============================================
export const InfraProviderSchema = z.enum(["aws", "gcp", "azure", "generic"]);
export const InfraEnvironmentSchema = z.enum([
  "production",
  "staging",
  "preview",
  "dev",
]);

const InfraBaseSchema = z.object({
  kind: z.literal("infra"),
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
  provider: InfraProviderSchema,
  environment: InfraEnvironmentSchema,
  region: z.string(),
  tags: z.array(z.string()).default([]),
});

export const InfraResourceTypeSchema = z.enum([
  "ec2",
  "lambda",
  "eks",
  "vpc",
  "s3",
  "rds",
  "load_balancer",
  "hpc",
]);

const Ec2ConfigSchema = z.object({
  instanceType: z.string(),
  ami: z.string(),
  count: z.number(),
  subnetIds: z.string(),
  securityGroups: z.string(),
  diskGb: z.number(),
  autoscalingMin: z.number(),
  autoscalingMax: z.number(),
});

const LambdaConfigSchema = z.object({
  runtime: z.string(),
  memoryMb: z.number(),
  timeoutSec: z.number(),
  handler: z.string(),
  source: z.string(),
  trigger: z.string(),
  environmentVars: z.string(),
});

const EksConfigSchema = z.object({
  version: z.string(),
  nodeType: z.string(),
  nodeCount: z.number(),
  minNodes: z.number(),
  maxNodes: z.number(),
  vpcId: z.string(),
  privateSubnets: z.string(),
  clusterLogs: z.string(),
});

const VpcConfigSchema = z.object({
  cidr: z.string(),
  publicSubnets: z.string(),
  privateSubnets: z.string(),
  natGateways: z.number(),
  flowLogs: z.boolean(),
});

const S3ConfigSchema = z.object({
  bucketName: z.string(),
  versioning: z.boolean(),
  encryption: z.string(),
  lifecycle: z.string(),
  publicAccess: z.string(),
});

const RdsConfigSchema = z.object({
  engine: z.string(),
  engineVersion: z.string(),
  instanceClass: z.string(),
  storageGb: z.number(),
  multiAz: z.boolean(),
  backupRetentionDays: z.number(),
  subnetGroup: z.string(),
});

const LoadBalancerConfigSchema = z.object({
  lbType: z.string(),
  scheme: z.string(),
  listeners: z.string(),
  targetGroup: z.string(),
  healthCheckPath: z.string(),
  tlsCertArn: z.string(),
});

const HpcConfigSchema = z.object({
  scheduler: z.string(),
  instanceType: z.string(),
  nodeCount: z.number(),
  maxNodes: z.number(),
  sharedStorage: z.string(),
  queue: z.string(),
});

const Ec2ResourceSchema = InfraBaseSchema.extend({
  resourceType: z.literal("ec2"),
  config: Ec2ConfigSchema,
});

const LambdaResourceSchema = InfraBaseSchema.extend({
  resourceType: z.literal("lambda"),
  config: LambdaConfigSchema,
});

const EksResourceSchema = InfraBaseSchema.extend({
  resourceType: z.literal("eks"),
  config: EksConfigSchema,
});

const VpcResourceSchema = InfraBaseSchema.extend({
  resourceType: z.literal("vpc"),
  config: VpcConfigSchema,
});

const S3ResourceSchema = InfraBaseSchema.extend({
  resourceType: z.literal("s3"),
  config: S3ConfigSchema,
});

const RdsResourceSchema = InfraBaseSchema.extend({
  resourceType: z.literal("rds"),
  config: RdsConfigSchema,
});

const LoadBalancerResourceSchema = InfraBaseSchema.extend({
  resourceType: z.literal("load_balancer"),
  config: LoadBalancerConfigSchema,
});

const HpcResourceSchema = InfraBaseSchema.extend({
  resourceType: z.literal("hpc"),
  config: HpcConfigSchema,
});

export const InfraBlockSchema = z.discriminatedUnion("resourceType", [
  Ec2ResourceSchema,
  LambdaResourceSchema,
  EksResourceSchema,
  VpcResourceSchema,
  S3ResourceSchema,
  RdsResourceSchema,
  LoadBalancerResourceSchema,
  HpcResourceSchema,
]);

// ============================================
// API Binding (Full OpenAPI/AsyncAPI Features)
// ============================================
export const HttpMethodSchema = z.enum([
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
]);

export const ApiProtocolSchema = z.enum([
  "rest",
  "ws",
  "socket.io",
  "webrtc",
  "graphql",
  "grpc",
  "sse",
  "webhook",
]);

export const SecuritySchemeSchema = z.object({
  type: z.enum(["none", "api_key", "bearer", "oauth2", "basic"]),
  headerName: z.string().optional(),
  scopes: z.array(z.string()),
});

export const RateLimitSchema = z.object({
  enabled: z.boolean(),
  requests: z.number(),
  window: z.enum(["second", "minute", "hour", "day"]),
});

export const RequestBodySchema = z.object({
  contentType: z.enum([
    "application/json",
    "multipart/form-data",
    "text/plain",
  ]),
  schema: z.array(InputFieldSchema),
});

export const RequestSchema = z.object({
  pathParams: z.array(InputFieldSchema),
  queryParams: z.array(InputFieldSchema),
  headers: z.array(InputFieldSchema),
  body: RequestBodySchema,
});

export const ResponseSchema = z.object({
  statusCode: z.number(),
  schema: z.array(OutputFieldSchema),
});

export const WebSocketConfigSchema = z
  .object({
    endpoint: z.string(),
    pingIntervalSec: z.number().int().positive(),
    pingTimeoutSec: z.number().int().positive(),
    maxMessageSizeKb: z.number().int().positive(),
    maxConnections: z.number().int().positive(),
    auth: SecuritySchemeSchema,
    rateLimit: RateLimitSchema,
  })
  .strict();

export const SocketIOConfigSchema = z
  .object({
    endpoint: z.string(),
    namespaces: z.array(z.string()),
    rooms: z.array(z.string()),
    events: z.array(z.string()),
    ackTimeoutMs: z.number().int().positive(),
    auth: SecuritySchemeSchema,
    rateLimit: RateLimitSchema,
  })
  .strict();

export const WebRTCConfigSchema = z
  .object({
    signalingTransportRef: z.string().min(1),
    stunServers: z.array(z.string()),
    turnServers: z.array(z.string()),
    peerLimit: z.number().int().positive(),
    topology: z.literal("p2p"),
  })
  .strict();

export const GraphQLConfigSchema = z
  .object({
    endpoint: z.string().min(1),
    schemaSDL: z.string().min(1),
    operations: z
      .object({
        queries: z.boolean(),
        mutations: z.boolean(),
        subscriptions: z.boolean(),
      })
      .refine(
        (ops) => ops.queries || ops.mutations || ops.subscriptions,
        "GraphQL requires at least one operation type",
      ),
  })
  .strict();

export const GrpcConfigSchema = z
  .object({
    protobufDefinition: z.string().min(1),
    service: z.string().min(1),
    rpcMethods: z
      .array(
        z
          .object({
            name: z.string().min(1),
            type: z.enum([
              "unary",
              "server_stream",
              "client_stream",
              "bidirectional_stream",
            ]),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export const SSEConfigSchema = z
  .object({
    endpoint: z.string().min(1),
    eventName: z.string().min(1),
    retryMs: z.number().int().positive(),
    heartbeatSec: z.number().int().positive(),
    direction: z.literal("server_to_client"),
  })
  .strict();

export const WebhookConfigSchema = z
  .object({
    endpoint: z.string().min(1),
    signatureVerification: z
      .object({
        enabled: z.boolean(),
        headerName: z.string(),
        secretRef: z.string(),
      })
      .strict()
      .optional(),
    retryPolicy: z
      .object({
        enabled: z.boolean(),
        maxAttempts: z.number().int().positive(),
        backoff: z.enum(["fixed", "linear", "exponential"]),
      })
      .strict(),
  })
  .strict();

const WebSocketInstanceSchema = z.object({
  protocol: z.literal("ws"),
  config: WebSocketConfigSchema,
});

const SocketIOInstanceSchema = z.object({
  protocol: z.literal("socket.io"),
  config: SocketIOConfigSchema,
});

const WebRTCInstanceSchema = z.object({
  protocol: z.literal("webrtc"),
  config: WebRTCConfigSchema,
});

const GraphQLInstanceSchema = z.object({
  protocol: z.literal("graphql"),
  config: GraphQLConfigSchema,
});

const GrpcInstanceSchema = z.object({
  protocol: z.literal("grpc"),
  config: GrpcConfigSchema,
});

const SSEInstanceSchema = z.object({
  protocol: z.literal("sse"),
  config: SSEConfigSchema,
});

const WebhookInstanceSchema = z.object({
  protocol: z.literal("webhook"),
  config: WebhookConfigSchema,
});

export const RealtimeInstanceSchema = z.discriminatedUnion("protocol", [
  WebSocketInstanceSchema,
  SocketIOInstanceSchema,
  WebRTCInstanceSchema,
]);

export const ApiInstanceSchema = z.discriminatedUnion("protocol", [
  GraphQLInstanceSchema,
  GrpcInstanceSchema,
  SSEInstanceSchema,
  WebhookInstanceSchema,
]);

export const NonRestInstanceSchema = z.discriminatedUnion("protocol", [
  WebSocketInstanceSchema,
  SocketIOInstanceSchema,
  WebRTCInstanceSchema,
  GraphQLInstanceSchema,
  GrpcInstanceSchema,
  SSEInstanceSchema,
  WebhookInstanceSchema,
]);

export const ApiBindingSchema = z.object({
  kind: z.literal("api_binding"),
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),

  // Primitive protocol
  protocol: ApiProtocolSchema,
  // Legacy compatibility with existing data model
  apiType: z.enum(["openapi", "asyncapi"]).optional(),
  // Strict instance union (non-REST protocols)
  instance: NonRestInstanceSchema.optional(),

  // Route Definition
  method: HttpMethodSchema.optional(),
  route: z.string().optional(),

  // Request Schema
  request: RequestSchema.optional(),

  // Response Schemas
  responses: z
    .object({
      success: ResponseSchema,
      error: ResponseSchema,
    })
    .optional(),

  // Security
  security: SecuritySchemeSchema.optional(),

  // Rate Limiting
  rateLimit: RateLimitSchema.optional(),

  // Versioning
  version: z.string(),
  deprecated: z.boolean(),

  // Process Reference
  processRef: z.string(),
}).superRefine((value, ctx) => {
  const isRealtime =
    value.protocol === "ws" ||
    value.protocol === "socket.io" ||
    value.protocol === "webrtc";
  const isAdditionalInstanceProtocol =
    value.protocol === "graphql" ||
    value.protocol === "grpc" ||
    value.protocol === "sse" ||
    value.protocol === "webhook";

  if (value.protocol === "rest") {
    if (!value.method || !value.route || !value.request || !value.responses) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "REST protocol requires method, route, request, and responses",
      });
    }
    if (!value.security || !value.rateLimit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "REST protocol requires security and rateLimit",
      });
    }
    if (value.instance) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "REST protocol cannot include instance config",
      });
    }
    return;
  }

  if (!isRealtime && !isAdditionalInstanceProtocol) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Unsupported protocol",
    });
    return;
  }

  if (!value.instance) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Non-REST protocols require an instance config",
    });
    return;
  }

  if (value.instance.protocol !== value.protocol) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Protocol must match instance protocol",
    });
  }

  if (
    value.method ||
    value.route ||
    value.request ||
    value.responses ||
    value.security ||
    value.rateLimit
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "Non-REST protocols cannot include REST method/route/request/response/security/rateLimit fields",
    });
  }

  if (value.protocol === "webrtc") {
    const signaling = value.instance.protocol === "webrtc"
      ? value.instance.config.signalingTransportRef
      : "";
    if (!signaling || signaling.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "WebRTC requires signalingTransportRef",
      });
    }
  }

  if (value.protocol === "graphql" && value.instance.protocol === "graphql") {
    if (!value.instance.config.schemaSDL.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "GraphQL requires schemaSDL",
      });
    }
  }

  if (value.protocol === "grpc" && value.instance.protocol === "grpc") {
    if (!value.instance.config.protobufDefinition.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "gRPC requires protobufDefinition",
      });
    }
    if (!value.instance.config.service.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "gRPC requires service",
      });
    }
    if (value.instance.config.rpcMethods.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "gRPC requires at least one RPC method",
      });
    }
  }
});

// ============================================
// Node Data - Union of all kinds
// ============================================
export const NodeDataSchema = z.union([
  ProcessDefinitionSchema,
  DatabaseBlockSchema,
  QueueBlockSchema,
  ServiceBoundaryBlockSchema,
  InfraBlockSchema,
  ApiBindingSchema,
]);

// ============================================
// React Flow Node Wrapper
// ============================================
export const ProcessNodeSchema = z.object({
  id: z.string(),
  type: z.string(),
  position: PositionSchema,
  data: NodeDataSchema,
  selected: z.boolean().optional(),
});

// ============================================
// Type Exports
// ============================================
export type ProcessNode = z.infer<typeof ProcessNodeSchema>;
export type NodeData = z.infer<typeof NodeDataSchema>;
export type ProcessDefinition = z.infer<typeof ProcessDefinitionSchema>;
export type DatabaseBlock = z.infer<typeof DatabaseBlockSchema>;
export type DatabaseTable = z.infer<typeof DatabaseTableSchema>;
export type DatabaseTableField = z.infer<typeof DatabaseTableFieldSchema>;
export type DatabaseRelationship = z.infer<typeof DatabaseRelationshipSchema>;
export type DatabaseFieldType = z.infer<typeof DatabaseFieldTypeSchema>;
export type DatabaseRelationType = z.infer<typeof DatabaseRelationTypeSchema>;
export type DatabaseSchemaChangeType = z.infer<typeof DatabaseSchemaChangeTypeSchema>;
export type DatabaseSchemaHistoryEntry = z.infer<typeof DatabaseSchemaHistoryEntrySchema>;
export type DatabaseQuery = z.infer<typeof DatabaseQuerySchema>;
export type DatabaseQueryOperation = z.infer<typeof DatabaseQueryOperationSchema>;
export type DatabaseQueryComplexity = z.infer<typeof DatabaseQueryComplexitySchema>;
export type DatabaseSeed = z.infer<typeof DatabaseSeedSchema>;
export type DatabaseSeedStrategy = z.infer<typeof DatabaseSeedStrategySchema>;
export type DatabaseMigration = z.infer<typeof DatabaseMigrationSchema>;
export type DatabaseOrmTarget = z.infer<typeof DatabaseOrmTargetSchema>;
export type DatabaseQueryWorkbench = z.infer<typeof DatabaseQueryWorkbenchSchema>;
export type DatabaseEnvironmentTier = z.infer<typeof DatabaseEnvironmentTierSchema>;
export type DatabaseEnvironmentOverride = z.infer<typeof DatabaseEnvironmentOverrideSchema>;
export type DatabaseEnvironmentConfig = z.infer<typeof DatabaseEnvironmentConfigSchema>;
export type DatabaseEnvironments = z.infer<typeof DatabaseEnvironmentsSchema>;
export type QueueBlock = z.infer<typeof QueueBlockSchema>;
export type ServiceBoundaryBlock = z.infer<typeof ServiceBoundaryBlockSchema>;
export type InfraBlock = z.infer<typeof InfraBlockSchema>;
export type InfraResourceType = z.infer<typeof InfraResourceTypeSchema>;
export type InfraProvider = z.infer<typeof InfraProviderSchema>;
export type InfraEnvironment = z.infer<typeof InfraEnvironmentSchema>;
export type ApiBinding = z.infer<typeof ApiBindingSchema>;
export type ApiInstance = z.infer<typeof ApiInstanceSchema>;
export type NonRestInstance = z.infer<typeof NonRestInstanceSchema>;
export type RealtimeInstance = z.infer<typeof RealtimeInstanceSchema>;
export type WebSocketConfig = z.infer<typeof WebSocketConfigSchema>;
export type SocketIOConfig = z.infer<typeof SocketIOConfigSchema>;
export type WebRTCConfig = z.infer<typeof WebRTCConfigSchema>;
export type GraphQLConfig = z.infer<typeof GraphQLConfigSchema>;
export type GrpcConfig = z.infer<typeof GrpcConfigSchema>;
export type SSEConfig = z.infer<typeof SSEConfigSchema>;
export type WebhookConfig = z.infer<typeof WebhookConfigSchema>;
export type InputField = z.infer<typeof InputFieldSchema>;
export type OutputField = z.infer<typeof OutputFieldSchema>;
export type ProcessStep = z.infer<typeof ProcessStepSchema>;
export type SecurityScheme = z.infer<typeof SecuritySchemeSchema>;
export type RateLimit = z.infer<typeof RateLimitSchema>;
