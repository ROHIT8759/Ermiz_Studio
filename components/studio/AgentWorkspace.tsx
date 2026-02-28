"use client";
import React, { useMemo, useState } from "react";
import { useStore } from "@/store/useStore";
export function AgentWorkspace() {
  const nodes = useStore((state) => state.nodes);
  const edges = useStore((state) => state.edges);
  const [prompt, setPrompt] = useState(
    "Review the current graph design and generate an execution plan.",
  );
  const [executionStatus, setExecutionStatus] = useState<
    "idle" | "running" | "done"
  >("idle");

  const summary = useMemo(() => {
    const kindCount: Record<string, number> = {};
    for (const node of nodes) {
      const kind =
        typeof node.data === "object" &&
        node.data &&
        "kind" in node.data &&
        typeof node.data.kind === "string"
          ? node.data.kind
          : node.type || "unknown";
      kindCount[kind] = (kindCount[kind] || 0) + 1;
    }
    return kindCount;
  }, [nodes]);

  const executionPayload = useMemo(
    () => ({
      generatedAt: new Date().toISOString(),
      nodeCount: nodes.length,
      edgeCount: edges.length,
      nodes: nodes.map((node) => ({
        id: node.id,
        type: node.type,
        kind:
          typeof node.data === "object" &&
          node.data &&
          "kind" in node.data &&
          typeof node.data.kind === "string"
            ? node.data.kind
            : node.type || "unknown",
        label:
          typeof node.data === "object" &&
          node.data &&
          "label" in node.data &&
          typeof node.data.label === "string"
            ? node.data.label
            : node.id,
      })),
      edges: edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: edge.type || "default",
      })),
    }),
    [edges, nodes],
  );

  const handleExecute = () => {
    setExecutionStatus("running");
    // In production, wire this to an AI / runtime endpoint.
    setTimeout(() => {
      setExecutionStatus("done");
    }, 1200);
  };

  return (
    <main
      style={{
        flex: 1,
        display: "grid",
        gridTemplateColumns: "minmax(320px, 420px) minmax(0, 1fr)",
        gap: 14,
        padding: 14,
        background: "var(--background)",
        overflow: "auto",
      }}
    >
      <section
        style={{
          border: "1px solid color-mix(in srgb, var(--border) 75%, #ffffff 25%)",
          background: "color-mix(in srgb, var(--panel) 90%, #0b0d12 10%)",
          borderRadius: 12,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          minHeight: "100%",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            borderBottom: "1px solid var(--border)",
            padding: "10px 12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600 }}>Agent</div>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>design mode</div>
        </div>

        <div
          style={{
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            flex: 1,
          }}
        >
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: 10,
              background: "color-mix(in srgb, var(--floating) 90%, #000 10%)",
            }}
          >
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>
              System
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.45 }}>
              I can inspect your flow design and generate an execution payload.
            </div>
          </div>

          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: 10,
              background: "color-mix(in srgb, var(--panel) 85%, #0f1117 15%)",
            }}
          >
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>
              You
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.45 }}>{prompt}</div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontSize: 11,
                border: "1px solid var(--border)",
                borderRadius: 999,
                padding: "4px 8px",
                color: "var(--muted)",
              }}
            >
              nodes {nodes.length}
            </span>
            <span
              style={{
                fontSize: 11,
                border: "1px solid var(--border)",
                borderRadius: 999,
                padding: "4px 8px",
                color: "var(--muted)",
              }}
            >
              edges {edges.length}
            </span>
          </div>
        </div>

        <div
          style={{
            borderTop: "1px solid var(--border)",
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            style={{
              width: "100%",
              resize: "vertical",
              border: "1px solid var(--border)",
              background: "var(--floating)",
              color: "var(--foreground)",
              borderRadius: 10,
              fontSize: 12,
              padding: 10,
              outline: "none",
            }}
          />
          <button
            type="button"
            onClick={handleExecute}
            disabled={executionStatus === "running"}
            aria-label="Execute agent from design"
            style={{
              border: "1px solid var(--border)",
              background:
                executionStatus === "running"
                  ? "var(--floating)"
                  : "var(--foreground)",
              color:
                executionStatus === "running"
                  ? "var(--muted)"
                  : "var(--background)",
              borderRadius: 10,
              padding: "8px 10px",
              fontSize: 12,
              fontWeight: 600,
              cursor: executionStatus === "running" ? "not-allowed" : "pointer",
            }}
          >
            {executionStatus === "running" ? "Processing…" : "Execute From Design"}
          </button>
          {executionStatus !== "idle" && (
            <div
              role="status"
              style={{
                borderRadius: 10,
                padding: "8px 10px",
                fontSize: 12,
                background:
                  executionStatus === "done"
                    ? "color-mix(in srgb, #4ade80 12%, var(--panel) 88%)"
                    : "color-mix(in srgb, var(--primary) 12%, var(--panel) 88%)",
                color:
                  executionStatus === "done" ? "#4ade80" : "var(--primary)",
              }}
            >
              {executionStatus === "running"
                ? "Agent is processing your design…"
                : "Done — execution payload ready in the Preview panel."}
            </div>
          )}
        </div>
      </section>

      <section
        style={{
          border: "1px solid color-mix(in srgb, var(--border) 75%, #ffffff 25%)",
          background: "color-mix(in srgb, var(--panel) 90%, #0b0d12 10%)",
          borderRadius: 12,
          padding: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            borderBottom: "1px solid var(--border)",
            padding: "10px 12px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600 }}>Preview</div>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>
            generated {executionPayload.generatedAt}
          </div>
        </div>

        <div style={{ padding: 12, overflow: "auto", display: "grid", gap: 12 }}>
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: 10,
              background: "color-mix(in srgb, var(--floating) 92%, #000 8%)",
            }}
          >
            <div style={{ fontSize: 12, marginBottom: 8 }}>Design Summary</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>
              Nodes: {nodes.length} | Connections: {edges.length}
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {Object.entries(summary).map(([kind, count]) => (
                <div key={kind} style={{ fontSize: 12 }}>
                  {kind}: {count}
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: 10,
              background: "color-mix(in srgb, var(--panel) 85%, #0f1117 15%)",
            }}
          >
            <div style={{ fontSize: 12, marginBottom: 8 }}>Execution Payload</div>
            <pre
              style={{
                margin: 0,
                fontSize: 12,
                lineHeight: 1.45,
                color: "var(--secondary)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                maxHeight: 420,
                overflow: "auto",
              }}
            >
              {JSON.stringify(executionPayload, null, 2)}
            </pre>
          </div>
        </div>
      </section>
    </main>
  );
}

