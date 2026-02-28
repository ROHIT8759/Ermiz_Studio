import { z } from "zod";
import { ProcessNodeSchema } from "./node";

export const EdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
  type: z.enum(["default", "step"]).default("default"), // 'step' for control flow
  animated: z.boolean().default(false),
});

export const GraphSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  version: z.string().default("1.0.0"),
  nodes: z.array(ProcessNodeSchema),
  edges: z.array(EdgeSchema),
});

export type ProcessEdge = z.infer<typeof EdgeSchema>;
export type ProcessGraph = z.infer<typeof GraphSchema>;

type GraphNode = {
  id: string;
  type?: string;
  data?: Record<string, unknown>;
};

type GraphEdge = {
  source: string;
  target: string;
};

type DBConnectionOperation = "read" | "write" | "unknown";

export type DBConnectionEntry = {
  nodeId: string;
  nodeName: string;
  nodeType: "process" | "api" | "trigger" | "unknown";
  operation: DBConnectionOperation;
};

export type DBConnectionSummary = {
  databaseNodeId: string;
  databaseId: string;
  databaseLabel: string;
  readers: DBConnectionEntry[];
  writers: DBConnectionEntry[];
  operationCount: number;
  connectionCount: number;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const detectNodeType = (node: GraphNode): DBConnectionEntry["nodeType"] => {
  const kind = isObject(node.data) ? String(node.data.kind || "") : "";
  if (kind === "process") return "process";
  if (kind === "api_binding") return "api";
  if (node.type === "trigger") return "trigger";
  return "unknown";
};

const detectNodeName = (node: GraphNode): string => {
  if (isObject(node.data) && typeof node.data.label === "string") {
    return node.data.label;
  }
  return node.id;
};

const inferOperation = (raw: string): DBConnectionOperation => {
  const text = raw.toLowerCase();
  if (/(select|get|read|fetch|query|find)\b/.test(text)) return "read";
  if (/(insert|update|delete|write|upsert|create|set)\b/.test(text)) {
    return "write";
  }
  return "unknown";
};

const containsDBRef = (
  text: string,
  databaseNodeId: string,
  databaseId: string,
  databaseLabel: string,
): boolean => {
  const raw = text.toLowerCase();
  const references = [databaseNodeId, databaseId, databaseLabel]
    .map((value) => value.toLowerCase())
    .filter(Boolean);
  return references.some((value) => raw.includes(value));
};

const scanForDatabasePropertyLinks = (
  data: unknown,
  databaseNodeId: string,
  databaseId: string,
  databaseLabel: string,
): string[] => {
  const matches: string[] = [];
  const walk = (value: unknown, keyPath: string) => {
    if (!isObject(value) && !Array.isArray(value)) return;

    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${keyPath}[${index}]`));
      return;
    }

    Object.entries(value).forEach(([key, next]) => {
      const path = keyPath ? `${keyPath}.${key}` : key;
      if (
        /(db|database)/i.test(key) &&
        typeof next === "string" &&
        containsDBRef(next, databaseNodeId, databaseId, databaseLabel)
      ) {
        matches.push(`${path}:${next}`);
      }
      walk(next, path);
    });
  };
  walk(data, "");
  return matches;
};

export const analyzeDBConnections = (graphState: {
  nodes: GraphNode[];
  edges: GraphEdge[];
}): Record<string, DBConnectionSummary> => {
  const nodes = graphState.nodes || [];
  const edges = graphState.edges || [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  const processNodes = nodes.filter(
    (node) => detectNodeType(node) === "process",
  );
  const apiNodes = nodes.filter((node) => detectNodeType(node) === "api");
  const processDataIdToNodeId = new Map<string, string>();
  processNodes.forEach((node) => {
    if (isObject(node.data) && typeof node.data.id === "string") {
      processDataIdToNodeId.set(node.data.id, node.id);
    }
  });

  const databaseNodes = nodes.filter(
    (node) => isObject(node.data) && node.data.kind === "database",
  );

  const result: Record<string, DBConnectionSummary> = {};

  databaseNodes.forEach((databaseNode) => {
    const dbData = isObject(databaseNode.data) ? databaseNode.data : {};
    const databaseId =
      typeof dbData.id === "string" ? dbData.id : databaseNode.id;
    const databaseLabel =
      typeof dbData.label === "string" ? dbData.label : databaseNode.id;

    const connectionMap = new Map<string, DBConnectionEntry>();

    const upsert = (entry: DBConnectionEntry) => {
      const existing = connectionMap.get(entry.nodeId);
      if (!existing) {
        connectionMap.set(entry.nodeId, entry);
        return;
      }
      if (existing.operation !== entry.operation) {
        connectionMap.set(entry.nodeId, { ...entry, operation: "unknown" });
      }
    };

    // 1) Direct graph connections.
    edges.forEach((edge) => {
      let connectedNode: GraphNode | undefined;
      let op: DBConnectionOperation = "unknown";

      if (edge.target === databaseNode.id) {
        connectedNode = nodeById.get(edge.source);
        op = "write";
      } else if (edge.source === databaseNode.id) {
        connectedNode = nodeById.get(edge.target);
        op = "read";
      }
      if (!connectedNode) return;
      const nodeType = detectNodeType(connectedNode);
      if (!["process", "api", "trigger"].includes(nodeType)) return;

      upsert({
        nodeId: connectedNode.id,
        nodeName: detectNodeName(connectedNode),
        nodeType,
        operation: op,
      });
    });

    // 2) Process step refs + db-linked properties.
    processNodes.forEach((node) => {
      const data = isObject(node.data) ? node.data : {};
      const steps = Array.isArray(data.steps) ? data.steps : [];
      let matched = false;
      let op: DBConnectionOperation = "unknown";

      steps.forEach((step) => {
        const blob = JSON.stringify(step);
        if (
          containsDBRef(blob, databaseNode.id, databaseId, databaseLabel)
        ) {
          matched = true;
          const inferred = inferOperation(blob);
          if (op === "unknown") op = inferred;
          else if (op !== inferred && inferred !== "unknown") op = "unknown";
        }
      });

      const linkedProps = scanForDatabasePropertyLinks(
        data,
        databaseNode.id,
        databaseId,
        databaseLabel,
      );
      if (linkedProps.length > 0) {
        matched = true;
        if (op === "unknown") {
          op = inferOperation(linkedProps.join(" "));
        }
      }

      if (!matched) return;
      upsert({
        nodeId: node.id,
        nodeName: detectNodeName(node),
        nodeType: "process",
        operation: op,
      });
    });

    // 3) API nodes referencing connected processes through processRef.
    apiNodes.forEach((apiNode) => {
      const apiData = isObject(apiNode.data) ? apiNode.data : {};
      const processRef =
        typeof apiData.processRef === "string" ? apiData.processRef : "";
      if (!processRef) return;

      const processNodeId =
        processDataIdToNodeId.get(processRef) ||
        processNodes.find((node) => {
          const label = detectNodeName(node);
          return label === processRef || node.id === processRef;
        })?.id;
      if (!processNodeId) return;

      const processConnection = connectionMap.get(processNodeId);
      if (!processConnection) return;

      upsert({
        nodeId: apiNode.id,
        nodeName: detectNodeName(apiNode),
        nodeType: "api",
        operation: processConnection.operation,
      });
    });

    const connections = Array.from(connectionMap.values());
    const readers = connections.filter((connection) => connection.operation === "read");
    const writers = connections.filter((connection) => connection.operation === "write");
    const operationCount = readers.length + writers.length;

    result[databaseNode.id] = {
      databaseNodeId: databaseNode.id,
      databaseId,
      databaseLabel,
      readers,
      writers,
      operationCount,
      connectionCount: connections.length,
    };
  });

  return result;
};
