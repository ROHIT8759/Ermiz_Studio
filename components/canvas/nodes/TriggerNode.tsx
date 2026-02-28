import React, { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import { NodeData } from "@/lib/schema/node";

export const TriggerNode = memo(
  ({ data, selected }: NodeProps) => {
    const nodeData = data as unknown as NodeData;
    const isApiBinding = nodeData.kind === "api_binding";
    const method = (isApiBinding ? nodeData.method : undefined) || "GET";
    const route = (isApiBinding ? nodeData.route : undefined) || "/";

    const methodColor =
      method === "GET" ? "#60a5fa" : method === "POST" ? "#4ade80" : "#fb923c";

    return (
      <BaseNode
        selected={!!selected}
        type="TRIGGER"
        label={nodeData.label}
        className={isApiBinding ? "trigger-accent" : ""}
      >
        <div className="relative" style={{ minHeight: 40 }}>
          {isApiBinding && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "var(--floating)",
                padding: "6px 8px",
                borderRadius: 4,
                fontSize: 12,
                marginBottom: 8,
              }}
            >
              <span
                style={{
                  fontWeight: 700,
                  textTransform: "uppercase",
                  color: methodColor,
                }}
              >
                {method}
              </span>
              <span
                style={{ fontFamily: "monospace", color: "var(--foreground)" }}
              >
                {route}
              </span>
            </div>
          )}

          <div
            style={{ fontSize: 10, color: "var(--muted)", padding: "0 4px" }}
          >
            {nodeData.description || "API Entry Point"}
          </div>

          {/* Output Handle (Right) Only */}
          <Handle
            type="source"
            position={Position.Right}
            style={{
              width: 12,
              height: 12,
              background: "var(--primary)",
              border: "2px solid var(--panel)",
              right: -6,
            }}
          />
        </div>
      </BaseNode>
    );
  },
);

TriggerNode.displayName = "TriggerNode";
