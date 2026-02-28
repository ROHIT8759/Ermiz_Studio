import { GraphCollection } from "@/lib/runtime/architecture";
import {
  DatabaseBlock,
  DatabaseBlockSchema,
  NodeData,
  ProcessDefinition,
  QueueBlock,
} from "@/lib/schema/node";
import {
  createRuntimeQueueAdapter,
  RuntimeQueueAdapter,
} from "@/lib/runtime/queue-adapter";
import { PrismaClient } from "@prisma/client";

type RuntimeLayer = 0 | 1 | 2 | 3;

type RuntimeNode = {
  id: string;
  data: NodeData;
  type?: string;
};

type RuntimeEdge = {
  source: string;
  target: string;
};

export type RuntimeExecutionNode = {
  id: string;
  kind: NodeData["kind"];
  label: string;
};

export type RuntimeFlowResult = {
  apiNode: RuntimeExecutionNode;
  finalNode: RuntimeExecutionNode;
  executionOrder: RuntimeExecutionNode[];
  response: {
    status: number;
    body: Record<string, unknown>;
  };
};

type RuntimeProcessContext = {
  input?: unknown;
  output?: Record<string, unknown>;
  strictValidation?: boolean;
};

type RuntimeGraphExecutionContext = {
  nodeById: Map<string, RuntimeNode>;
  incomingById: Map<string, string[]>;
  outgoingById: Map<string, string[]>;
};

type RuntimeEngineOptions = {
  queueAdapter?: RuntimeQueueAdapter;
};

type RuntimeStartOptions = {
  onOrder?: (
    node: RuntimeExecutionNode,
    index: number,
    total: number,
  ) => void;
  onExecute?: (
    node: RuntimeExecutionNode,
    index: number,
    total: number,
  ) => void;
};

const getRuntimeLayer = (node: NodeData): RuntimeLayer | null => {
  switch (node.kind) {
    case "api_binding":
      return 0;
    case "process":
      return 1;
    case "database":
      return 2;
    case "infra":
    case "queue":
      return 3;
    default:
      return null;
  }
};

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizePath = (path: string): string => {
  const withLeadingSlash = path.startsWith("/") ? path : `/${path}`;
  const normalized = withLeadingSlash.replace(/\/+/g, "/");
  if (normalized.length > 1 && normalized.endsWith("/")) {
    return normalized.slice(0, -1);
  }
  return normalized;
};

const routePatternToRegex = (route: string): RegExp => {
  const normalized = normalizePath(route);
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 0) {
    return /^\/$/;
  }

  const pattern = segments
    .map((segment) => {
      if (segment.startsWith("[...") && segment.endsWith("]")) return ".+";
      if (segment.startsWith("[") && segment.endsWith("]")) return "[^/]+";
      if (segment.startsWith(":")) return "[^/]+";
      if (segment.startsWith("{") && segment.endsWith("}")) return "[^/]+";
      return escapeRegex(segment);
    })
    .join("/");

  return new RegExp(`^/${pattern}$`);
};

const matchesHttpRoute = (route: string, path: string): boolean =>
  routePatternToRegex(route).test(normalizePath(path));

const defaultValueForType = (type: string): unknown => {
  if (type === "string") return "";
  if (type === "number") return 0;
  if (type === "boolean") return false;
  if (type === "array") return [];
  if (type === "object") return {};
  return null;
};

const compareNodeIds = (a: RuntimeNode, b: RuntimeNode): number => {
  const layerA = getRuntimeLayer(a.data) ?? Number.MAX_SAFE_INTEGER;
  const layerB = getRuntimeLayer(b.data) ?? Number.MAX_SAFE_INTEGER;
  if (layerA !== layerB) return layerA - layerB;
  return a.id.localeCompare(b.id);
};

export class RuntimeEngine {
  private static readonly prismaClientPool = new Map<string, PrismaClient>();
  private readonly graphs: GraphCollection;
  private readonly queueAdapter: RuntimeQueueAdapter;

  constructor(graphs: GraphCollection, options?: RuntimeEngineOptions) {
    this.graphs = graphs;
    this.queueAdapter = options?.queueAdapter ?? createRuntimeQueueAdapter();
  }

  public async start(options?: RuntimeStartOptions): Promise<RuntimeExecutionNode[]> {
    const { nodes, edges } = this.collectGraphData();
    const sortedNodes = this.topologicalSort(nodes, edges);
    const explicitEdges = this.collectExplicitEdges();
    const executionContext = this.buildExecutionContext(nodes, explicitEdges);
    const databaseByReference = this.createDatabaseReferenceMap(sortedNodes);
    const processContext: RuntimeProcessContext = {
      input: undefined,
      strictValidation: false,
    };
    const executionOrder = sortedNodes.map((node) => ({
      id: node.id,
      kind: node.data.kind,
      label: node.data.label || node.id,
    }));

    console.log("[RuntimeEngine] Execution order:");
    for (const [index, node] of executionOrder.entries()) {
      console.log(`- ${node.kind}:${node.id}`);
      options?.onOrder?.(node, index, executionOrder.length);
    }

    for (const [index, node] of executionOrder.entries()) {
      console.log(`[RuntimeEngine] Executing ${node.kind}:${node.id}`);
      options?.onExecute?.(node, index, executionOrder.length);
      await this.executeNode(
        sortedNodes[index],
        processContext,
        databaseByReference,
        executionContext,
      );
    }

    return executionOrder;
  }

  public findRestApiNode(
    method: string,
    path: string,
  ): RuntimeExecutionNode | null {
    const { nodes } = this.collectGraphData();
    const normalizedMethod = method.toUpperCase();
    const normalizedPath = normalizePath(path);

    for (const node of nodes) {
      const api = node.data;
      if (api.kind !== "api_binding") continue;
      if (api.protocol !== "rest") continue;

      const isRestBlock =
        node.type === undefined ||
        node.type === "api_rest" ||
        node.type === "api_binding";
      if (!isRestBlock) continue;

      const route = (api.route || "").trim();
      const apiMethod = (api.method || "").toUpperCase();
      if (!route || !apiMethod) continue;

      if (apiMethod !== normalizedMethod) continue;
      if (!matchesHttpRoute(route, normalizedPath)) continue;

      return {
        id: node.id,
        kind: api.kind,
        label: api.label || node.id,
      };
    }

    return null;
  }

  public async executeRestRequest(params: {
    method: string;
    path: string;
    payload?: unknown;
  }): Promise<RuntimeFlowResult | null> {
    const apiNode = this.findRestApiNode(params.method, params.path);
    if (!apiNode) return null;
    return this.executeFromApiNode(apiNode.id, params.payload);
  }

  public async executeFromApiNode(
    apiNodeId: string,
    payload?: unknown,
  ): Promise<RuntimeFlowResult> {
    const { nodes, edges } = this.collectGraphData();
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const adjacency = new Map<string, Set<string>>();

    for (const node of nodes) {
      adjacency.set(node.id, new Set<string>());
    }
    for (const edge of edges) {
      if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) continue;
      adjacency.get(edge.source)?.add(edge.target);
    }

    const reachable = new Set<string>();
    const queue: string[] = [apiNodeId];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || reachable.has(current)) continue;
      reachable.add(current);
      const neighbors = adjacency.get(current);
      if (!neighbors) continue;
      for (const nextId of neighbors) {
        if (!reachable.has(nextId)) queue.push(nextId);
      }
    }

    const flowNodes = nodes.filter((node) => reachable.has(node.id));
    const flowEdges = edges.filter(
      (edge) => reachable.has(edge.source) && reachable.has(edge.target),
    );
    const explicitEdges = this.collectExplicitEdges().filter(
      (edge) => reachable.has(edge.source) && reachable.has(edge.target),
    );
    const executionContext = this.buildExecutionContext(flowNodes, explicitEdges);
    const ordered = this.topologicalSort(flowNodes, flowEdges);
    const executionOrder = ordered.map((node) => ({
      id: node.id,
      kind: node.data.kind,
      label: node.data.label || node.id,
    }));

    if (executionOrder.length === 0) {
      throw new Error(`No executable flow found for API node "${apiNodeId}"`);
    }

    const finalNode = ordered[ordered.length - 1];
    const apiNode = nodeById.get(apiNodeId);
    if (!apiNode || apiNode.data.kind !== "api_binding") {
      throw new Error(`API node "${apiNodeId}" is invalid or missing`);
    }

    const processContext: RuntimeProcessContext = {
      input: payload,
      strictValidation: true,
    };
    const databaseByReference = this.createDatabaseReferenceMap(nodes);

    for (const node of ordered) {
      console.log(`[RuntimeEngine] Executing ${node.data.kind}:${node.id}`);
      if (node.data.kind === "process") {
        const output = await this.executeProcessBlock(
          node.data,
          processContext,
          databaseByReference,
        );
        if (output) {
          processContext.output = output;
        }
        continue;
      }

      await this.executeNode(
        node,
        processContext,
        databaseByReference,
        executionContext,
      );
    }

    return {
      apiNode: {
        id: apiNode.id,
        kind: apiNode.data.kind,
        label: apiNode.data.label || apiNode.id,
      },
      finalNode: {
        id: finalNode.id,
        kind: finalNode.data.kind,
        label: finalNode.data.label || finalNode.id,
      },
      executionOrder,
      response: {
        status: apiNode.data.responses?.success.statusCode ?? 200,
        body: this.buildFinalResponseBody(
          apiNode.data,
          finalNode,
          payload,
          processContext.output,
        ),
      },
    };
  }

  private async executeNode(
    node: RuntimeNode,
    processContext: RuntimeProcessContext = {
      input: undefined,
      strictValidation: false,
    },
    databaseByReference: Map<string, DatabaseBlock> = this.createDatabaseReferenceMap(
      this.collectGraphData().nodes,
    ),
    executionContext: RuntimeGraphExecutionContext = this.buildExecutionContext(
      this.collectGraphData().nodes,
      this.collectExplicitEdges(),
    ),
  ): Promise<void> {
    switch (node.data.kind) {
      case "process":
        {
          const output = await this.executeProcessBlock(
            node.data,
            processContext,
            databaseByReference,
          );
          if (output) {
            processContext.output = output;
          }
        }
        return;
      case "queue":
        await this.executeQueueBlock(node, processContext, executionContext);
        return;
      case "database":
        await this.executeDatabaseBlock(node.data);
        return;
      default:
        return;
    }
  }

  private async executeDatabaseBlock(node: DatabaseBlock): Promise<void> {
    const parsed = DatabaseBlockSchema.safeParse(node);
    if (!parsed.success) {
      console.error(
        `[RuntimeEngine] Invalid database block "${node.id}" configuration.`,
        parsed.error.flatten(),
      );
      return;
    }

    const database = parsed.data;
    const connectionString = this.resolveDatabaseConnectionString(database);

    if (!connectionString) {
      console.error(
        `[RuntimeEngine] Database block "${database.id}" has no connection string configured.`,
      );
      return;
    }

    const prisma = this.getOrCreatePrismaClient(connectionString);

    try {
      await prisma.$connect();

      const modelTables = (database.tables ?? [])
        .map((table) => table.name.trim())
        .filter(Boolean);

      if (modelTables.length === 0) {
        return;
      }

      const configuredSchemas = (database.schemas ?? [])
        .map((schema) => schema.trim())
        .filter(Boolean);
      const schemas = configuredSchemas.length > 0 ? configuredSchemas : ["public"];

      for (const tableName of modelTables) {
        const exists = await this.tableExists(prisma, schemas, tableName);
        if (!exists) {
          console.warn(
            `[RuntimeEngine] Table "${tableName}" for database block "${database.id}" was not found.`,
          );
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown_error";
      console.error(
        `[RuntimeEngine] Failed to connect/validate database block "${database.id}": ${message}`,
      );
    }
  }

  private createDatabaseReferenceMap(nodes: RuntimeNode[]): Map<string, DatabaseBlock> {
    const databaseByReference = new Map<string, DatabaseBlock>();

    for (const node of nodes) {
      if (node.data.kind !== "database") continue;
      databaseByReference.set(node.id, node.data);
      if (node.data.id) {
        databaseByReference.set(node.data.id, node.data);
      }
      if (node.data.label) {
        databaseByReference.set(node.data.label, node.data);
      }
    }

    return databaseByReference;
  }

  private async executeProcessBlock(
    process: ProcessDefinition,
    context: RuntimeProcessContext,
    databaseByReference: Map<string, DatabaseBlock>,
  ): Promise<Record<string, unknown> | undefined> {
    for (const step of process.steps) {
      const stepKind = step.kind as string;

      if (stepKind === "condition") {
        if (context.strictValidation) {
          this.validateProcessInput(process, step.id, context.input, step.config);
        }
        continue;
      }

      if (stepKind === "db_operation") {
        const dbRef = (step.ref || "").trim();
        const databaseNode = dbRef ? databaseByReference.get(dbRef) : undefined;

        if (!databaseNode) {
          console.warn(
            `[RuntimeEngine] Process "${process.id}" references missing database "${dbRef}" in step "${step.id}".`,
          );
          continue;
        }

        await this.executeDatabaseBlock(databaseNode);

        const operation = String(step.config?.operation ?? "")
          .trim()
          .toLowerCase();
        if (operation === "create") {
          await this.executeCreateDbOperation(databaseNode, step.config, context);
        }
        continue;
      }

      if (stepKind === "return") {
        const config = step.config;
        const explicitValue =
          config && typeof config === "object"
            ? (config as Record<string, unknown>).value
            : undefined;

        if (explicitValue && typeof explicitValue === "object" && !Array.isArray(explicitValue)) {
          return explicitValue as Record<string, unknown>;
        }

        if (context.input && typeof context.input === "object" && !Array.isArray(context.input)) {
          return context.input as Record<string, unknown>;
        }

        return { value: explicitValue ?? null };
      }
    }

    return undefined;
  }

  private validateProcessInput(
    process: ProcessDefinition,
    stepId: string,
    input: unknown,
    config: Record<string, unknown> | undefined,
  ): void {
    const requiredFieldsRaw = config?.requiredFields;
    const requiredFields = Array.isArray(requiredFieldsRaw)
      ? requiredFieldsRaw.filter((field): field is string => typeof field === "string")
      : [];

    if (requiredFields.length === 0) {
      return;
    }

    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error(
        `Process "${process.id}" validation failed at step "${stepId}": input object required.`,
      );
    }

    const payload = input as Record<string, unknown>;
    const missing = requiredFields.filter((field) => {
      const value = payload[field];
      return value === undefined || value === null || value === "";
    });

    if (missing.length > 0) {
      throw new Error(
        `Process "${process.id}" validation failed at step "${stepId}": missing ${missing.join(", ")}`,
      );
    }
  }

  private isSafeSqlIdentifier(value: string): boolean {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
  }

  private async executeCreateDbOperation(
    databaseNode: DatabaseBlock,
    config: Record<string, unknown> | undefined,
    context: RuntimeProcessContext,
  ): Promise<void> {
    if (databaseNode.dbType !== "sql") {
      console.warn(
        `[RuntimeEngine] Create operation is only supported for SQL database blocks ("${databaseNode.id}").`,
      );
      return;
    }

    const tableCandidate =
      String(config?.table ?? config?.model ?? "").trim() ||
      (databaseNode.tables[0]?.name || "").trim();
    if (!tableCandidate) {
      console.warn(
        `[RuntimeEngine] Create operation for "${databaseNode.id}" has no target table/model.`,
      );
      return;
    }

    const schemaCandidate =
      String(config?.schema ?? "").trim() ||
      databaseNode.schemas[0]?.trim() ||
      "public";

    if (!this.isSafeSqlIdentifier(schemaCandidate) || !this.isSafeSqlIdentifier(tableCandidate)) {
      console.warn(
        `[RuntimeEngine] Skipping create operation for "${databaseNode.id}" due to unsafe schema/table name.`,
      );
      return;
    }

    const payloadCandidate =
      config?.data && typeof config.data === "object" && !Array.isArray(config.data)
        ? (config.data as Record<string, unknown>)
        : context.input && typeof context.input === "object" && !Array.isArray(context.input)
          ? (context.input as Record<string, unknown>)
          : null;

    if (!payloadCandidate) {
      console.warn(
        `[RuntimeEngine] Create operation for "${databaseNode.id}" requires object payload data.`,
      );
      return;
    }

    const entries = Object.entries(payloadCandidate).filter(
      ([, value]) => value !== undefined,
    );
    if (entries.length === 0) {
      console.warn(
        `[RuntimeEngine] Create operation for "${databaseNode.id}" has no insertable fields.`,
      );
      return;
    }

    for (const [column] of entries) {
      if (!this.isSafeSqlIdentifier(column)) {
        console.warn(
          `[RuntimeEngine] Skipping create operation for "${databaseNode.id}" due to unsafe column "${column}".`,
        );
        return;
      }
    }

    const connectionString = this.resolveDatabaseConnectionString(databaseNode);
    if (!connectionString) {
      console.error(
        `[RuntimeEngine] Cannot run create operation for "${databaseNode.id}" without connection string.`,
      );
      return;
    }

    const prisma = this.getOrCreatePrismaClient(connectionString);
    const columns = entries.map(([column]) => `"${column}"`).join(", ");
    const placeholders = entries.map((_, index) => `$${index + 1}`).join(", ");
    const values = entries.map(([, value]) => value);
    const sql =
      `INSERT INTO "${schemaCandidate}"."${tableCandidate}" (${columns}) ` +
      `VALUES (${placeholders})`;

    try {
      await prisma.$connect();
      await prisma.$executeRawUnsafe(sql, ...values);
      context.output = {
        ...(context.output || {}),
        insertedTable: tableCandidate,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown_error";
      console.error(
        `[RuntimeEngine] Create operation failed for "${databaseNode.id}" on "${schemaCandidate}.${tableCandidate}": ${message}`,
      );
    }
  }

  private getQueueName(queueNode: QueueBlock): string {
    const label = queueNode.label.trim();
    return label.length > 0 ? label : queueNode.id;
  }

  private resolveQueueModes(
    queueNode: RuntimeNode,
    context: RuntimeGraphExecutionContext,
  ): { ingestion: boolean; consumer: boolean } {
    const incoming = context.incomingById.get(queueNode.id) ?? [];
    const outgoing = context.outgoingById.get(queueNode.id) ?? [];

    const isIngestion = incoming.some((sourceId) => {
      const sourceNode = context.nodeById.get(sourceId);
      return sourceNode?.data.kind !== "queue";
    });

    const isConsumer = outgoing.some((targetId) => {
      const targetNode = context.nodeById.get(targetId);
      return targetNode?.data.kind === "process" || targetNode?.data.kind === "api_binding";
    });

    if (!isIngestion && !isConsumer) {
      return { ingestion: true, consumer: true };
    }

    return { ingestion: isIngestion, consumer: isConsumer };
  }

  private toQueuePayload(context: RuntimeProcessContext): Record<string, unknown> {
    if (context.output && typeof context.output === "object") {
      return context.output;
    }

    if (context.input && typeof context.input === "object" && !Array.isArray(context.input)) {
      return context.input as Record<string, unknown>;
    }

    return {
      value: context.input ?? null,
    };
  }

  private async executeQueueBlock(
    queueRuntimeNode: RuntimeNode,
    context: RuntimeProcessContext,
    graphContext: RuntimeGraphExecutionContext,
  ): Promise<void> {
    if (queueRuntimeNode.data.kind !== "queue") return;
    const queueNode = queueRuntimeNode.data;
    const queueName = this.getQueueName(queueNode);
    const modes = this.resolveQueueModes(queueRuntimeNode, graphContext);
    const backend = this.queueAdapter.kind;

    if (modes.ingestion) {
      const payload = this.toQueuePayload(context);
      const job = await this.queueAdapter.enqueue(queueName, payload);
      console.log(
        `[RuntimeEngine] Enqueued job "${job.jobId}" to queue "${queueName}" (${backend}).`,
      );
    }

    if (modes.consumer) {
      await this.queueAdapter.registerWorker(queueName, async (payload) => {
        console.log(
          `[RuntimeEngine] Processed queue job from "${queueName}" with payload keys: ${Object.keys(payload).join(", ")}.`,
        );
      });

      const processedCount = await this.queueAdapter.drain(queueName);
      console.log(
        `[RuntimeEngine] Queue worker ready for "${queueName}" (${backend}, processed ${processedCount} jobs).`,
      );
    }
  }

  private resolveDatabaseConnectionString(node: DatabaseBlock): string {
    const runtimeEnv = process.env.RUNTIME_DB_ENV?.trim().toLowerCase();
    const envConnectionString = runtimeEnv === "production"
      ? node.environments.production.connectionString
      : runtimeEnv === "staging"
        ? node.environments.staging.connectionString
        : node.environments.dev.connectionString;

    return envConnectionString.trim() || process.env.DATABASE_URL?.trim() || "";
  }

  private getOrCreatePrismaClient(connectionString: string): PrismaClient {
    const pooled = RuntimeEngine.prismaClientPool.get(connectionString);
    if (pooled) {
      return pooled;
    }

    const client = new PrismaClient({
      datasources: {
        db: {
          url: connectionString,
        },
      },
      log:
        process.env.NODE_ENV === "development"
          ? ["query", "error", "warn"]
          : ["error"],
    });

    RuntimeEngine.prismaClientPool.set(connectionString, client);
    return client;
  }

  private async tableExists(
    prisma: PrismaClient,
    schemas: string[],
    tableName: string,
  ): Promise<boolean> {
    for (const schemaName of schemas) {
      const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = ${schemaName}
            AND table_name = ${tableName}
        ) AS "exists"
      `;

      if (result[0]?.exists) {
        return true;
      }
    }

    return false;
  }

  private buildFinalResponseBody(
    apiNode: Extract<NodeData, { kind: "api_binding" }>,
    finalNode: RuntimeNode,
    payload?: unknown,
    processOutput?: Record<string, unknown>,
  ): Record<string, unknown> {
    if (processOutput && Object.keys(processOutput).length > 0) {
      return processOutput;
    }

    if (finalNode.data.kind === "process") {
      const processPayload: Record<string, unknown> = {};
      for (const field of finalNode.data.outputs.success) {
        const inputValue =
          payload && typeof payload === "object"
            ? (payload as Record<string, unknown>)[field.name]
            : undefined;
        processPayload[field.name] =
          inputValue !== undefined ? inputValue : defaultValueForType(field.type);
      }
      if (Object.keys(processPayload).length > 0) {
        return processPayload;
      }
    }

    const apiSuccessFields = apiNode.responses?.success.schema ?? [];
    if (apiSuccessFields.length > 0) {
      const apiPayload: Record<string, unknown> = {};
      for (const field of apiSuccessFields) {
        const inputValue =
          payload && typeof payload === "object"
            ? (payload as Record<string, unknown>)[field.name]
            : undefined;
        apiPayload[field.name] =
          inputValue !== undefined ? inputValue : defaultValueForType(field.type);
      }
      return apiPayload;
    }

    return {
      ok: true,
      finalNodeId: finalNode.id,
      finalNodeKind: finalNode.data.kind,
      finalNodeLabel: finalNode.data.label || finalNode.id,
    };
  }

  private collectExplicitEdges(): RuntimeEdge[] {
    const edges: RuntimeEdge[] = [];
    for (const graph of Object.values(this.graphs)) {
      for (const edge of graph?.edges ?? []) {
        edges.push({ source: edge.source, target: edge.target });
      }
    }
    return edges;
  }

  private buildExecutionContext(
    nodes: RuntimeNode[],
    edges: RuntimeEdge[],
  ): RuntimeGraphExecutionContext {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const incomingById = new Map<string, string[]>();
    const outgoingById = new Map<string, string[]>();

    for (const node of nodes) {
      incomingById.set(node.id, []);
      outgoingById.set(node.id, []);
    }

    for (const edge of edges) {
      if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) continue;
      outgoingById.get(edge.source)?.push(edge.target);
      incomingById.get(edge.target)?.push(edge.source);
    }

    return { nodeById, incomingById, outgoingById };
  }

  private collectGraphData(): { nodes: RuntimeNode[]; edges: RuntimeEdge[] } {
    const nodeById = new Map<string, RuntimeNode>();
    const edges: RuntimeEdge[] = [];

    for (const graph of Object.values(this.graphs)) {
      for (const node of graph?.nodes ?? []) {
        if (getRuntimeLayer(node.data) === null) continue;
        if (!nodeById.has(node.id)) {
          nodeById.set(node.id, {
            id: node.id,
            data: node.data,
            type: (node as { type?: string }).type,
          });
        }
      }

      for (const edge of graph?.edges ?? []) {
        edges.push({ source: edge.source, target: edge.target });
      }
    }

    // Enforce architecture-layer dependency direction:
    // API -> Process -> Data -> Infra.
    const layerBuckets: Record<RuntimeLayer, string[]> = {
      0: [],
      1: [],
      2: [],
      3: [],
    };

    for (const node of nodeById.values()) {
      const layer = getRuntimeLayer(node.data);
      if (layer !== null) {
        layerBuckets[layer].push(node.id);
      }
    }

    for (let layer = 0 as RuntimeLayer; layer < 3; layer = (layer + 1) as RuntimeLayer) {
      const nextLayer = (layer + 1) as RuntimeLayer;
      for (const source of layerBuckets[layer]) {
        for (const target of layerBuckets[nextLayer]) {
          edges.push({ source, target });
        }
      }
    }

    return { nodes: [...nodeById.values()], edges };
  }

  private topologicalSort(nodes: RuntimeNode[], edges: RuntimeEdge[]): RuntimeNode[] {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const adjacency = new Map<string, Set<string>>();
    const inDegree = new Map<string, number>();

    for (const node of nodes) {
      adjacency.set(node.id, new Set<string>());
      inDegree.set(node.id, 0);
    }

    for (const edge of edges) {
      if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) continue;
      if (edge.source === edge.target) continue;

      const neighbors = adjacency.get(edge.source);
      if (!neighbors || neighbors.has(edge.target)) continue;

      neighbors.add(edge.target);
      inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
    }

    const ready: RuntimeNode[] = nodes
      .filter((node) => (inDegree.get(node.id) ?? 0) === 0)
      .sort(compareNodeIds);

    const ordered: RuntimeNode[] = [];

    while (ready.length > 0) {
      const current = ready.shift();
      if (!current) break;

      ordered.push(current);
      const neighbors = adjacency.get(current.id);
      if (!neighbors) continue;

      for (const neighborId of neighbors) {
        const nextDegree = (inDegree.get(neighborId) ?? 0) - 1;
        inDegree.set(neighborId, nextDegree);
        if (nextDegree === 0) {
          const neighbor = nodeById.get(neighborId);
          if (neighbor) ready.push(neighbor);
        }
      }

      ready.sort(compareNodeIds);
    }

    if (ordered.length !== nodes.length) {
      const orderedIds = new Set(ordered.map((node) => node.id));
      const unresolved = nodes
        .filter((node) => !orderedIds.has(node.id))
        .sort(compareNodeIds);
      console.warn(
        "[RuntimeEngine] Cycle or unresolved dependencies detected. Appending remaining nodes.",
      );
      ordered.push(...unresolved);
    }

    return ordered;
  }
}
