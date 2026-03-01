/**
 * Unit tests for lib/validate-architecture.ts
 */

import { describe, it, expect } from "vitest";
import { validateArchitecture } from "@/lib/validate-architecture";
import { Node, Edge } from "@xyflow/react";

// ── Helpers ────────────────────────────────────────────────────────────────

function makeNode(overrides: Partial<Node> & { data: Record<string, unknown> }): Node {
  return {
    id: overrides.id ?? "n1",
    position: overrides.position ?? { x: 0, y: 0 },
    type: overrides.type ?? "process",
    data: overrides.data,
  };
}

function makeEdge(source: string, target: string): Edge {
  return { id: `${source}-${target}`, source, target };
}

function graphs(nodes: Node[], edges: Edge[] = []) {
  return { api: { nodes, edges }, database: { nodes: [], edges: [] }, functions: { nodes: [], edges: [] }, agent: { nodes: [], edges: [] } };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("validateArchitecture", () => {
  // ── empty canvas ──────────────────────────────────────────────────────

  it("returns error when no nodes exist", () => {
    const result = validateArchitecture(graphs([]));
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].title).toContain("No blocks");
  });

  // ── missing labels ────────────────────────────────────────────────────

  it("returns error for nodes without labels", () => {
    const n = makeNode({ id: "n1", data: { kind: "process", label: "" } });
    const result = validateArchitecture(graphs([n]));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.title.includes("no label"))).toBe(true);
  });

  // ── valid single node ─────────────────────────────────────────────────

  it("passes for a single valid node", () => {
    const n = makeNode({ id: "n1", data: { kind: "process", label: "Do Stuff" } });
    const result = validateArchitecture(graphs([n]));
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // ── orphan nodes ──────────────────────────────────────────────────────

  it("warns about orphan nodes when multiple nodes exist", () => {
    const n1 = makeNode({ id: "n1", data: { kind: "process", label: "A" } });
    const n2 = makeNode({ id: "n2", data: { kind: "process", label: "B" } });
    const result = validateArchitecture(graphs([n1, n2], []));
    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => w.title.includes("not connected"))).toBe(true);
  });

  it("does not warn about orphans when nodes are connected", () => {
    const n1 = makeNode({ id: "n1", data: { kind: "process", label: "A" } });
    const n2 = makeNode({ id: "n2", data: { kind: "process", label: "B" } });
    const result = validateArchitecture(graphs([n1, n2], [makeEdge("n1", "n2")]));
    expect(result.warnings.some((w) => w.title.includes("not connected"))).toBe(false);
  });

  // ── duplicate labels ──────────────────────────────────────────────────

  it("warns about duplicate labels", () => {
    const n1 = makeNode({ id: "n1", data: { kind: "process", label: "MyService" } });
    const n2 = makeNode({ id: "n2", data: { kind: "process", label: "MyService" } });
    const result = validateArchitecture(graphs([n1, n2], [makeEdge("n1", "n2")]));
    expect(result.warnings.some((w) => w.title.includes("Duplicate label"))).toBe(true);
  });

  // ── dangling edges ────────────────────────────────────────────────────

  it("errors on dangling edges (source missing)", () => {
    const n1 = makeNode({ id: "n1", data: { kind: "process", label: "A" } });
    const result = validateArchitecture(graphs([n1], [makeEdge("ghost", "n1")]));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.title.includes("missing source"))).toBe(true);
  });

  it("errors on dangling edges (target missing)", () => {
    const n1 = makeNode({ id: "n1", data: { kind: "process", label: "A" } });
    const result = validateArchitecture(graphs([n1], [makeEdge("n1", "ghost")]));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.title.includes("missing target"))).toBe(true);
  });

  // ── API binding without route ─────────────────────────────────────────

  it("errors on API binding with no route", () => {
    const n = makeNode({ id: "api1", type: "api_binding", data: { kind: "api_binding", label: "Users API", route: "" } });
    const result = validateArchitecture(graphs([n]));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.title.includes("no route"))).toBe(true);
  });

  it("warns on API binding not connected to any process", () => {
    const n = makeNode({ id: "api1", type: "api_binding", data: { kind: "api_binding", label: "Users API", route: "/api/users" } });
    const result = validateArchitecture(graphs([n]));
    // single node → no orphan warning, but still warns about no connected process
    expect(result.warnings.some((w) => w.title.includes("no connected process"))).toBe(true);
  });

  // ── process without steps ─────────────────────────────────────────────

  it("warns on process with no steps", () => {
    const n = makeNode({ id: "p1", data: { kind: "process", label: "Handler", steps: [] } });
    const result = validateArchitecture(graphs([n]));
    expect(result.warnings.some((w) => w.title.includes("no steps"))).toBe(true);
  });

  // ── database without tables ───────────────────────────────────────────

  it("warns on database with no tables", () => {
    const n = makeNode({ id: "db1", type: "database", data: { kind: "database", label: "Primary DB", tables: [] } });
    const result = validateArchitecture(graphs([n]));
    expect(result.warnings.some((w) => w.title.includes("no tables"))).toBe(true);
  });

  // ── api_endpoint with broken link ─────────────────────────────────────

  it("errors when api_endpoint references a deleted API interface", () => {
    const endpoint = makeNode({ id: "ep1", type: "api_endpoint", data: { kind: "api_endpoint", label: "Link", targetApiId: "nonexistent" } });
    const result = validateArchitecture(graphs([endpoint]));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.title.includes("deleted API interface"))).toBe(true);
  });

  it("warns when api_endpoint has no link", () => {
    const endpoint = makeNode({ id: "ep1", type: "api_endpoint", data: { kind: "api_endpoint", label: "Link", targetApiId: "" } });
    const result = validateArchitecture(graphs([endpoint]));
    expect(result.warnings.some((w) => w.title.includes("not linked"))).toBe(true);
  });

  it("passes when api_endpoint links to existing API binding", () => {
    const api = makeNode({ id: "api1", type: "api_binding", data: { kind: "api_binding", label: "Users API", route: "/users" } });
    const endpoint = makeNode({ id: "ep1", type: "api_endpoint", data: { kind: "api_endpoint", label: "Link", targetApiId: "api1" } });
    const g = {
      api: { nodes: [api], edges: [] },
      database: { nodes: [endpoint], edges: [] },
      functions: { nodes: [], edges: [] },
      agent: { nodes: [], edges: [] },
    };
    const result = validateArchitecture(g);
    expect(result.errors.filter((e) => e.title.includes("API interface"))).toHaveLength(0);
  });

  // ── complex valid architecture ────────────────────────────────────────

  it("passes a well-formed architecture with no errors", () => {
    const api = makeNode({ id: "api1", type: "api_binding", data: { kind: "api_binding", label: "Users", route: "/api/users", method: "GET" } });
    const proc = makeNode({ id: "p1", type: "process", data: { kind: "process", label: "GetUsers", steps: [{ id: "s1", action: "query" }] } });
    const db = makeNode({ id: "db1", type: "database", data: { kind: "database", label: "UsersDB", tables: [{ name: "users" }] } });
    const edges = [makeEdge("api1", "p1"), makeEdge("p1", "db1")];
    const result = validateArchitecture(graphs([api, proc, db], edges));
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
