import React, { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { ServiceBoundaryBlock } from "@/lib/schema/node";

export const ServiceBoundaryNode = memo(({ data, selected }: NodeProps) => {
  const service = data as unknown as ServiceBoundaryBlock;

  return (
    <div
      style={{
        background: "var(--panel)",
        border: selected ? "2px solid #fb7185" : "1px solid var(--border)",
        borderRadius: 8,
        minWidth: 280,
        boxShadow: selected
          ? "0 0 0 2px rgba(251, 113, 133, 0.2)"
          : "0 4px 12px rgba(0, 0, 0, 0.3)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderBottom: "1px solid var(--border)",
          background: "var(--floating)",
          borderRadius: "8px 8px 0 0",
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            color: "#fb7185",
            letterSpacing: "0.06em",
          }}
        >
          Service Boundary
        </span>
        <span style={{ fontSize: 10, color: "var(--muted)" }}>
          {service.computeRef ? "compute linked" : "compute required"}
        </span>
      </div>

      <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>
          {service.label}
        </div>
        {service.description && (
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
            {service.description}
          </div>
        )}
      </div>

      <div style={{ padding: "8px 12px", display: "grid", gap: 6, fontSize: 11 }}>
        <div style={{ color: "var(--secondary)" }}>
          API: <span style={{ color: "var(--foreground)" }}>{service.apiRefs.length}</span>
        </div>
        <div style={{ color: "var(--secondary)" }}>
          Functions:{" "}
          <span style={{ color: "var(--foreground)" }}>{service.functionRefs.length}</span>
        </div>
        <div style={{ color: "var(--secondary)" }}>
          Data: <span style={{ color: "var(--foreground)" }}>{service.dataRefs.length}</span>
        </div>
        <div style={{ color: "var(--secondary)" }}>
          Compute:{" "}
          <span style={{ color: "var(--foreground)" }}>
            {service.computeRef || "(unset)"}
          </span>
        </div>
      </div>

      <Handle
        type="target"
        position={Position.Left}
        style={{
          width: 10,
          height: 10,
          background: "#fb7185",
          border: "2px solid var(--panel)",
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{
          width: 10,
          height: 10,
          background: "#fb7185",
          border: "2px solid var(--panel)",
        }}
      />
    </div>
  );
});

ServiceBoundaryNode.displayName = "ServiceBoundaryNode";

