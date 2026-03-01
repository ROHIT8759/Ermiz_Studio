/**
 * Architecture Validator
 *
 * Validates the canvas graph BEFORE code generation runs, surfacing issues
 * early so the user can fix them rather than burning Gemini quota on a broken
 * design.
 *
 * Errors   — blocking (Generate is disabled until resolved)
 * Warnings — informational (user can proceed, but should be aware)
 */

import type { Node, Edge } from "@xyflow/react";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type Severity = "error" | "warning";

export interface ArchIssue {
  id: string;
  severity: Severity;
  nodeId?: string;
  nodeLabel?: string;
  message: string;
  suggestion?: string;
}

export interface ValidationResult {
  valid: boolean;         // false if any errors exist
  issues: ArchIssue[];
  errorCount: number;
  warningCount: number;
  nodeCount: number;
  edgeCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

type AnyData = Record<string, unknown>;

function kind(node: Node): string {
  return String((node.data as AnyData).kind ?? "");
}

function label(node: Node): string {
  return String((node.data as AnyData).label ?? node.id);
}

// ─────────────────────────────────────────────────────────────────────────────
// Validator
// ─────────────────────────────────────────────────────────────────────────────

export function validateArchitecture(
  nodes: Node[],
  edges: Edge[],
): ValidationResult {
  const issues: ArchIssue[] = [];
  let idSeq = 0;

  const err = (
    code: string,
    message: string,
    nodeId?: string,
    nodeLabel?: string,
    suggestion?: string,
  ) => issues.push({ id: `${code}-${++idSeq}`, severity: "error", nodeId, nodeLabel, message, suggestion });

  const warn = (
    code: string,
    message: string,
    nodeId?: string,
    nodeLabel?: string,
    suggestion?: string,
  ) => issues.push({ id: `${code}-${++idSeq}`, severity: "warning", nodeId, nodeLabel, message, suggestion });

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Set of node IDs that are connected to at least one edge
  const connectedIds = new Set<string>();
  edges.forEach((e) => { connectedIds.add(e.source); connectedIds.add(e.target); });

  // "Meaningful" = not a service_boundary (cosmetic grouping node)
  const meaningful = nodes.filter((n) => kind(n) !== "service_boundary");

  // ── 1. Empty canvas ───────────────────────────────────────────────────────
  if (meaningful.length === 0) {
    err(
      "EMPTY_CANVAS",
      "Canvas has no components. Add API, Function, Database or Queue nodes first.",
      undefined, undefined,
      "Drag nodes from the left sidebar onto the canvas.",
    );
    return buildResult(issues, nodes, edges);
  }

  // ── 2. Dangling edges (source or target doesn't exist) ────────────────────
  for (const edge of edges) {
    if (!nodeMap.has(edge.source)) {
      err(
        "DANGLING_EDGE_SRC",
        `Edge "${edge.id}" references a source node that no longer exists (id: ${edge.source}).`,
        undefined, undefined,
        "Delete this edge and reconnect.",
      );
    }
    if (!nodeMap.has(edge.target)) {
      err(
        "DANGLING_EDGE_TGT",
        `Edge "${edge.id}" references a target node that no longer exists (id: ${edge.target}).`,
        undefined, undefined,
        "Delete this edge and reconnect.",
      );
    }
  }

  // ── 3. Self-loops ─────────────────────────────────────────────────────────
  for (const edge of edges) {
    if (edge.source === edge.target) {
      warn(
        "SELF_LOOP",
        `Node "${label(nodeMap.get(edge.source)!)}" is connected to itself.`,
        edge.source,
        label(nodeMap.get(edge.source)!),
        "Self-loops have no meaning in a backend architecture. Remove this edge.",
      );
    }
  }

  // Track seen routes for duplicate detection
  const seenRoutes = new Map<string, string>(); // "METHOD /route" → nodeId

  // ── 4. Per-node validation ────────────────────────────────────────────────
  for (const node of meaningful) {
    const data = node.data as AnyData;
    const k = kind(node);
    const lbl = label(node);

    // ── 4a. API bindings ─────────────────────────────────────────────────────
    if (k === "api_binding") {
      const protocol = String(data.protocol ?? "rest");

      if (protocol === "rest") {
        const method = String(data.method ?? "").toUpperCase();
        const route  = String(data.route  ?? "").trim();

        if (!method) {
          err(
            "API_NO_METHOD",
            `API "${lbl}" has no HTTP method set.`,
            node.id, lbl,
            'Set a method (GET, POST, PUT, PATCH, DELETE) in the node\'s Properties panel.',
          );
        }

        if (!route) {
          err(
            "API_NO_ROUTE",
            `API "${lbl}" has no route defined.`,
            node.id, lbl,
            "Set a route like /api/users or /api/users/:id.",
          );
        } else {
          if (!route.startsWith("/")) {
            err(
              "API_ROUTE_SLASH",
              `API "${lbl}" route "${route}" must start with /.`,
              node.id, lbl,
              `Change the route to "/${route}".`,
            );
          }
          if (/\s/.test(route)) {
            err(
              "API_ROUTE_SPACES",
              `API "${lbl}" route "${route}" contains spaces.`,
              node.id, lbl,
              "Routes cannot have spaces. Use hyphens or %20 for URL encoding.",
            );
          }
          // Duplicate route check
          const key = `${method} ${route}`;
          if (seenRoutes.has(key)) {
            err(
              "DUPLICATE_ROUTE",
              `Duplicate route: ${key} is defined on multiple API nodes.`,
              node.id, lbl,
              `Check node "${lbl}" and the earlier node with the same route.`,
            );
          } else {
            seenRoutes.set(key, node.id);
          }
        }
      }

      // API not connected to anything
      if (!connectedIds.has(node.id)) {
        warn(
          "ISOLATED_API",
          `API "${lbl}" is not connected to any Function.`,
          node.id, lbl,
          "Connect this API node to a Function block to define its handler logic.",
        );
      }
    }

    // ── 4b. Process / function blocks ────────────────────────────────────────
    if (k === "process") {
      if (!lbl || lbl === node.id) {
        warn(
          "PROC_NO_LABEL",
          `A Function block (id: ${node.id}) has no label.`,
          node.id, lbl,
          "Add a label so the generated code has a meaningful function name.",
        );
      }

      const steps = (data.steps as unknown[]) ?? [];
      if (steps.length === 0) {
        warn(
          "PROC_NO_STEPS",
          `Function "${lbl}" has no steps defined.`,
          node.id, lbl,
          "Add steps in the Properties panel so the AI understands what this function does.",
        );
      }
    }

    // ── 4c. Database blocks ───────────────────────────────────────────────────
    if (k === "database") {
      const tables = (data.tables as unknown[]) ?? [];
      if (tables.length === 0) {
        warn(
          "DB_NO_TABLES",
          `Database "${lbl}" has no tables defined.`,
          node.id, lbl,
          "Add at least one table in the Database designer so the AI can generate schema code.",
        );
      } else {
        for (const t of tables as AnyData[]) {
          const tName = String(t.name ?? "unnamed");
          const fields = (t.fields as unknown[]) ?? [];
          if (fields.length === 0) {
            warn(
              "TABLE_NO_FIELDS",
              `Table "${tName}" in "${lbl}" has no columns defined.`,
              node.id, lbl,
              `Add at least one column to the "${tName}" table.`,
            );
          }
        }
      }

      // Database not connected to anything
      if (!connectedIds.has(node.id)) {
        warn(
          "ISOLATED_DB",
          `Database "${lbl}" is not connected to any Function.`,
          node.id, lbl,
          "Connect this Database to a Function block that reads or writes data.",
        );
      }
    }

    // ── 4d. Queue blocks ──────────────────────────────────────────────────────
    if (k === "queue") {
      const delivery = String(data.delivery ?? "");
      const valid = ["at_least_once", "at_most_once", "exactly_once"];
      if (!valid.includes(delivery)) {
        err(
          "QUEUE_BAD_DELIVERY",
          `Queue "${lbl}" has an invalid delivery guarantee: "${delivery}".`,
          node.id, lbl,
          "Set delivery to at_least_once, at_most_once, or exactly_once.",
        );
      }
      if (!connectedIds.has(node.id)) {
        warn(
          "ISOLATED_QUEUE",
          `Queue "${lbl}" is not connected to any Function.`,
          node.id, lbl,
          "Connect a publisher and/or consumer Function to this Queue.",
        );
      }
    }
  }

  // ── 5. Graph-level checks ─────────────────────────────────────────────────

  const apiNodes      = meaningful.filter((n) => kind(n) === "api_binding");
  const processNodes  = meaningful.filter((n) => kind(n) === "process");
  const dbNodes       = meaningful.filter((n) => kind(n) === "database");

  if (apiNodes.length > 0 && processNodes.length === 0) {
    warn(
      "NO_FUNCTIONS",
      `You have ${apiNodes.length} API endpoint(s) but no Function blocks.`,
      undefined, undefined,
      "Add a Function block and connect it to your APIs to define the business logic.",
    );
  }

  if (dbNodes.length > 0 && processNodes.length === 0) {
    warn(
      "DB_NO_FUNCTIONS",
      `You have ${dbNodes.length} Database(s) but no Function blocks to access them.`,
      undefined, undefined,
      "Add a Function block and connect it to your Databases.",
    );
  }

  // Completely isolated meaningful nodes (not connected to anything)
  const totalIsolated = meaningful.filter((n) => !connectedIds.has(n.id));
  if (totalIsolated.length === meaningful.length && meaningful.length > 1) {
    warn(
      "ALL_ISOLATED",
      "No nodes are connected. The AI will generate independent components with no wiring.",
      undefined, undefined,
      "Draw edges between nodes to express dependencies and API-to-function relationships.",
    );
  }

  return buildResult(issues, nodes, edges);
}

function buildResult(
  issues: ArchIssue[],
  nodes: Node[],
  edges: Edge[],
): ValidationResult {
  const meaningful = nodes.filter((n) => kind(n) !== "service_boundary");
  const errorCount   = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  return {
    valid: errorCount === 0,
    issues,
    errorCount,
    warningCount,
    nodeCount: meaningful.length,
    edgeCount: edges.length,
  };
}
