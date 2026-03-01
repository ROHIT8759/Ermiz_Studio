import React, { memo, useMemo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { ApiEndpointBlock, ApiBinding } from "@/lib/schema/node";
import { useStore } from "@/store/useStore";

export const ApiEndpointNode = memo(({ id, data, selected }: NodeProps) => {
    const epData = data as unknown as ApiEndpointBlock;
    const graphs = useStore((s) => s.graphs);

    // Resolve the referenced API binding from the API canvas
    const resolvedApi = useMemo<ApiBinding | null>(() => {
        if (!epData.targetApiId) return null;
        const apiGraph = graphs.api;
        if (!apiGraph?.nodes) return null;
        const node = apiGraph.nodes.find(
            (n) =>
                (n.data as { id?: string }).id === epData.targetApiId ||
                n.id === epData.targetApiId,
        );
        if (!node) return null;
        const d = node.data as { kind?: string };
        return d.kind === "api_binding" ? (node.data as unknown as ApiBinding) : null;
    }, [epData.targetApiId, graphs.api]);

    const method = resolvedApi?.method || epData.method || "";
    const route = resolvedApi?.route || epData.route || "";
    const protocol = resolvedApi?.protocol || epData.protocol || "rest";
    const label = epData.label || resolvedApi?.label || "API Endpoint";
    const linked = Boolean(resolvedApi);

    const methodColors: Record<string, string> = {
        GET: "#60a5fa",
        POST: "#4ade80",
        PUT: "#facc15",
        DELETE: "#ef4444",
        PATCH: "#a78bfa",
    };
    const protocolColors: Record<string, string> = {
        rest: methodColors[method] || "#60a5fa",
        ws: "#22d3ee",
        "socket.io": "#38bdf8",
        webrtc: "#f472b6",
        graphql: "#c084fc",
        grpc: "#34d399",
        sse: "#f59e0b",
        webhook: "#fb7185",
    };
    const accentColor = protocolColors[protocol] || "#60a5fa";

    return (
        <div
            style={{
                background: "var(--panel)",
                border: selected
                    ? "2px solid var(--primary)"
                    : `1px solid var(--border)`,
                borderRadius: 8,
                minWidth: 220,
                boxShadow: selected
                    ? "0 0 0 2px rgba(124, 108, 255, 0.2)"
                    : "0 4px 12px rgba(0, 0, 0, 0.3)",
            }}
        >
            {/* Header */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 12px",
                    borderBottom: "1px solid var(--border)",
                    background: accentColor,
                    borderRadius: "8px 8px 0 0",
                }}
            >
                <span style={{ fontSize: 14 }}>🔌</span>
                <span
                    style={{
                        fontSize: 10,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        color: "white",
                        letterSpacing: "0.05em",
                    }}
                >
                    API ENDPOINT
                </span>
                {linked && (
                    <span
                        style={{
                            marginLeft: "auto",
                            fontSize: 9,
                            color: "rgba(255,255,255,0.9)",
                            border: "1px solid rgba(255,255,255,0.35)",
                            borderRadius: 999,
                            padding: "1px 6px",
                        }}
                    >
                        LINKED
                    </span>
                )}
                {!linked && (
                    <span
                        style={{
                            marginLeft: "auto",
                            fontSize: 9,
                            color: "rgba(255,255,255,0.7)",
                            border: "1px solid rgba(255,255,255,0.25)",
                            borderRadius: 999,
                            padding: "1px 6px",
                        }}
                    >
                        UNLINKED
                    </span>
                )}
            </div>

            {/* Body */}
            <div style={{ padding: "10px 12px" }}>
                <div
                    style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "var(--foreground)",
                        marginBottom: 6,
                    }}
                >
                    {label}
                </div>

                {protocol === "rest" && method && (
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            marginBottom: 4,
                        }}
                    >
                        <span
                            style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: methodColors[method] || "#60a5fa",
                                background:
                                    "color-mix(in srgb, " +
                                    (methodColors[method] || "#60a5fa") +
                                    " 15%, var(--panel) 85%)",
                                borderRadius: 3,
                                padding: "2px 6px",
                            }}
                        >
                            {method}
                        </span>
                        <span
                            style={{
                                fontSize: 11,
                                color: "var(--secondary)",
                                fontFamily: "monospace",
                            }}
                        >
                            {route || "/..."}
                        </span>
                    </div>
                )}

                {protocol !== "rest" && (
                    <div
                        style={{
                            fontSize: 11,
                            color: "var(--secondary)",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                        }}
                    >
                        <span
                            style={{
                                fontSize: 10,
                                fontWeight: 600,
                                color: accentColor,
                                textTransform: "uppercase",
                                background:
                                    "color-mix(in srgb, " + accentColor + " 15%, var(--panel) 85%)",
                                borderRadius: 3,
                                padding: "2px 6px",
                            }}
                        >
                            {protocol}
                        </span>
                        {route && (
                            <span style={{ fontFamily: "monospace" }}>{route}</span>
                        )}
                    </div>
                )}

                {epData.description && (
                    <div
                        style={{
                            fontSize: 11,
                            color: "var(--muted)",
                            marginTop: 4,
                        }}
                    >
                        {epData.description}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div
                style={{
                    padding: "6px 12px",
                    borderTop: "1px solid var(--border)",
                    fontSize: 10,
                    color: "var(--muted)",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                }}
            >
                <span>🔗 {linked ? "Connected to API tab" : "Not linked"}</span>
            </div>

            {/* Handles */}
            <Handle
                type="target"
                position={Position.Left}
                style={{
                    width: 10,
                    height: 10,
                    background: "var(--muted)",
                    border: "2px solid var(--panel)",
                }}
            />
            <Handle
                type="source"
                position={Position.Right}
                style={{
                    width: 10,
                    height: 10,
                    background: accentColor,
                    border: "2px solid var(--panel)",
                }}
            />
        </div>
    );
});

ApiEndpointNode.displayName = "ApiEndpointNode";
