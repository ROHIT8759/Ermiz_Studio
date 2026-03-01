/**
 * Pre-generation architecture validation.
 *
 * Runs a series of structural checks on all graph tabs before the user
 * triggers AI-based code generation.  Errors block generation; warnings
 * are presented but can be overridden.
 */

import { Edge, Node } from "@xyflow/react";

// ── Types ──────────────────────────────────────────────────────────────────

export type Severity = "error" | "warning";

export interface ValidationIssue {
  severity: Severity;
  /** Short human-readable title (one line). */
  title: string;
  /** Optional extra detail shown in a collapsible section or tooltip. */
  detail?: string;
  /** Node id this issue relates to (for highlighting). */
  nodeId?: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

type GraphMap = Record<string, { nodes: Node[]; edges: Edge[] }>;

// ── Helpers ────────────────────────────────────────────────────────────────

function nodeLabel(node: Node): string {
  const d = node.data as Record<string, unknown>;
  return (d?.label as string) || node.id;
}

// ── Checks ─────────────────────────────────────────────────────────────────

function checkNoNodes(allNodes: Node[]): ValidationIssue | null {
  if (allNodes.length === 0) {
    return { severity: "error", title: "No blocks on the canvas", detail: "Add at least one block before generating code." };
  }
  return null;
}

function checkOrphanNodes(allNodes: Node[], allEdges: Edge[]): ValidationIssue[] {
  const connectedIds = new Set<string>();
  for (const e of allEdges) {
    connectedIds.add(e.source);
    connectedIds.add(e.target);
  }
  const issues: ValidationIssue[] = [];
  // Only flag orphans when there are at least 2 nodes (single node is fine)
  if (allNodes.length >= 2) {
    for (const n of allNodes) {
      if (!connectedIds.has(n.id)) {
        issues.push({
          severity: "warning",
          title: `"${nodeLabel(n)}" is not connected to anything`,
          detail: "This block has no edges. It will still be included but may be isolated in the generated project.",
          nodeId: n.id,
        });
      }
    }
  }
  return issues;
}

function checkMissingLabels(allNodes: Node[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const n of allNodes) {
    const d = n.data as Record<string, unknown>;
    const label = d?.label as string | undefined;
    if (!label || !label.trim()) {
      issues.push({
        severity: "error",
        title: `Block "${n.id}" has no label`,
        detail: "Every block needs a descriptive label so the AI can generate meaningful code.",
        nodeId: n.id,
      });
    }
  }
  return issues;
}

function checkProcessBlocks(allNodes: Node[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const n of allNodes) {
    const d = n.data as Record<string, unknown>;
    if (d?.kind !== "process") continue;
    const steps = d?.steps as unknown[];
    if (!steps || !Array.isArray(steps) || steps.length === 0) {
      issues.push({
        severity: "warning",
        title: `Process "${nodeLabel(n)}" has no steps defined`,
        detail: "The AI will infer steps from the label and connections, but explicit steps produce better code.",
        nodeId: n.id,
      });
    }
  }
  return issues;
}

function checkApiBindings(allNodes: Node[], allEdges: Edge[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seenRoutes = new Map<string, string>(); // "METHOD /route" → nodeLabel

  for (const n of allNodes) {
    const d = n.data as Record<string, unknown>;
    if (d?.kind !== "api_binding") continue;

    const protocol = (d?.protocol as string | undefined) ?? "rest";
    const route    = (d?.route   as string | undefined) ?? "";
    const method   = ((d?.method as string | undefined) ?? "").toUpperCase();
    const lbl      = nodeLabel(n);

    if (protocol === "rest") {
      if (!route.trim()) {
        issues.push({
          severity: "error",
          title: `API "${lbl}" has no route defined`,
          detail: "Set a route (e.g. /api/users) so the AI knows which endpoint to generate.",
          nodeId: n.id,
        });
      } else {
        if (!route.startsWith("/")) {
          issues.push({
            severity: "error",
            title: `API "${lbl}" route "${route}" must start with /`,
            detail: `Change the route to "/${route}".`,
            nodeId: n.id,
          });
        }
        if (/\s/.test(route)) {
          issues.push({
            severity: "error",
            title: `API "${lbl}" route "${route}" contains spaces`,
            detail: "Routes cannot contain spaces. Use hyphens or %20.",
            nodeId: n.id,
          });
        }
      }

      if (!method) {
        issues.push({
          severity: "error",
          title: `API "${lbl}" has no HTTP method set`,
          detail: "Set a method (GET, POST, PUT, PATCH, DELETE) in the Properties panel.",
          nodeId: n.id,
        });
      } else if (route.trim() && route.startsWith("/") && !(/\s/.test(route))) {
        const key = `${method} ${route.trim()}`;
        if (seenRoutes.has(key)) {
          issues.push({
            severity: "error",
            title: `Duplicate route: ${key}`,
            detail: `"${lbl}" and "${seenRoutes.get(key)}" share the same route.`,
            nodeId: n.id,
          });
        } else {
          seenRoutes.set(key, lbl);
        }
      }
    }

    // Check that API binding connects to at least one process
    const hasOutgoing = allEdges.some((e) => e.source === n.id);
    if (!hasOutgoing) {
      issues.push({
        severity: "warning",
        title: `API "${lbl}" has no connected process`,
        detail: "An API endpoint without a linked process will generate a stub handler.",
        nodeId: n.id,
      });
    }
  }
  return issues;
}

function checkDatabaseBlocks(allNodes: Node[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const n of allNodes) {
    const d = n.data as Record<string, unknown>;
    if (d?.kind !== "database") continue;
    const tables = d?.tables as unknown[];
    if (!tables || !Array.isArray(tables) || tables.length === 0) {
      issues.push({
        severity: "warning",
        title: `Database "${nodeLabel(n)}" has no tables`,
        detail: "Define at least one table for the AI to generate a meaningful schema.",
        nodeId: n.id,
      });
    } else {
      for (const t of tables as Record<string, unknown>[]) {
        const fields = (t.fields as unknown[]) ?? [];
        if (fields.length === 0) {
          issues.push({
            severity: "warning",
            title: `Table "${t.name as string}" in "${nodeLabel(n)}" has no columns`,
            detail: "Add at least one column so the AI generates a useful schema.",
            nodeId: n.id,
          });
        }
      }
    }
  }
  return issues;
}

function checkQueueBlocks(allNodes: Node[]): ValidationIssue[] {
  const VALID_DELIVERIES = ["at_least_once", "at_most_once", "exactly_once"];
  const issues: ValidationIssue[] = [];
  for (const n of allNodes) {
    const d = n.data as Record<string, unknown>;
    if (d?.kind !== "queue") continue;
    const delivery = d?.delivery as string | undefined;
    if (delivery && !VALID_DELIVERIES.includes(delivery)) {
      issues.push({
        severity: "error",
        title: `Queue "${nodeLabel(n)}" has invalid delivery guarantee: "${delivery}"`,
        detail: "Set delivery to at_least_once, at_most_once, or exactly_once.",
        nodeId: n.id,
      });
    }
  }
  return issues;
}

function checkSelfLoops(allNodes: Node[], allEdges: Edge[]): ValidationIssue[] {
  const nodeMap = new Map(allNodes.map((n) => [n.id, n]));
  return allEdges
    .filter((e) => e.source === e.target && nodeMap.has(e.source))
    .map((e) => ({
      severity: "warning" as Severity,
      title: `"${nodeLabel(nodeMap.get(e.source)!)}" is connected to itself`,
      detail: "Self-loops have no meaning in a backend architecture. Remove this edge.",
      nodeId: e.source,
    }));
}

function checkDuplicateLabels(allNodes: Node[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Map<string, string[]>();
  for (const n of allNodes) {
    const label = (n.data as Record<string, unknown>)?.label as string;
    if (!label) continue;
    const key = label.trim().toLowerCase();
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key)!.push(n.id);
  }
  for (const [, ids] of seen) {
    if (ids.length > 1) {
      issues.push({
        severity: "warning",
        title: `Duplicate label "${(allNodes.find((n) => n.id === ids[0])?.data as Record<string, unknown>)?.label}" on ${ids.length} blocks`,
        detail: `Node IDs: ${ids.join(", ")}. Duplicate labels may cause the AI to conflate their responsibilities.`,
      });
    }
  }
  return issues;
}

function checkDanglingEdges(allNodes: Node[], allEdges: Edge[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const nodeIds = new Set(allNodes.map((n) => n.id));
  for (const e of allEdges) {
    if (!nodeIds.has(e.source)) {
      issues.push({
        severity: "error",
        title: `Edge references missing source block "${e.source}"`,
        detail: "Remove this edge or restore the source block.",
      });
    }
    if (!nodeIds.has(e.target)) {
      issues.push({
        severity: "error",
        title: `Edge references missing target block "${e.target}"`,
        detail: "Remove this edge or restore the target block.",
      });
    }
  }
  return issues;
}

function checkApiEndpointLinks(allNodes: Node[], graphs: GraphMap): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  // Collect all API binding node IDs across all tabs
  const apiBindingIds = new Set<string>();
  for (const g of Object.values(graphs)) {
    for (const n of g.nodes) {
      const d = n.data as Record<string, unknown>;
      if (d?.kind === "api_binding") apiBindingIds.add(n.id);
    }
  }
  for (const n of allNodes) {
    const d = n.data as Record<string, unknown>;
    if (d?.kind !== "api_endpoint") continue;
    const targetApiId = d?.targetApiId as string | undefined;
    if (!targetApiId || !targetApiId.trim()) {
      issues.push({
        severity: "warning",
        title: `API Endpoint "${nodeLabel(n)}" is not linked to any API interface`,
        detail: "Link it to an API interface from the API tab for cross-tab integration.",
        nodeId: n.id,
      });
    } else if (!apiBindingIds.has(targetApiId)) {
      issues.push({
        severity: "error",
        title: `API Endpoint "${nodeLabel(n)}" references a deleted API interface`,
        detail: `Target "${targetApiId}" no longer exists. Update or remove the link.`,
        nodeId: n.id,
      });
    }
  }
  return issues;
}

// ── Main entry point ───────────────────────────────────────────────────────

export function validateArchitecture(graphs: GraphMap): ValidationResult {
  const allNodes = Object.values(graphs).flatMap((g) => g.nodes);
  const allEdges = Object.values(graphs).flatMap((g) => g.edges);

  const issues: ValidationIssue[] = [];

  // Collect issues from each checker
  const noNodes = checkNoNodes(allNodes);
  if (noNodes) issues.push(noNodes);
  issues.push(...checkMissingLabels(allNodes));
  issues.push(...checkDanglingEdges(allNodes, allEdges));
  issues.push(...checkSelfLoops(allNodes, allEdges));
  issues.push(...checkApiBindings(allNodes, allEdges));
  issues.push(...checkApiEndpointLinks(allNodes, graphs));
  issues.push(...checkQueueBlocks(allNodes));
  issues.push(...checkDuplicateLabels(allNodes));
  issues.push(...checkOrphanNodes(allNodes, allEdges));
  issues.push(...checkProcessBlocks(allNodes));
  issues.push(...checkDatabaseBlocks(allNodes));

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  return { ok: errors.length === 0, errors, warnings };
}
