import React, { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { QueueBlock } from "@/lib/schema/node";

export const QueueNode = memo(({ data, selected }: NodeProps) => {
  const queueData = data as unknown as QueueBlock;

  const deliveryColors: Record<string, string> = {
    at_least_once: "#facc15",
    at_most_once: "#fb923c",
    exactly_once: "#4ade80",
  };

  return (
    <div
      style={{
        background: "var(--panel)",
        border: selected
          ? "2px solid var(--primary)"
          : "1px solid var(--border)",
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
          background: "var(--floating)",
          borderRadius: "8px 8px 0 0",
        }}
      >
        <span style={{ fontSize: 14 }}>📬</span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: "uppercase",
            color: deliveryColors[queueData.delivery],
            letterSpacing: "0.05em",
          }}
        >
          Queue
        </span>
      </div>

      {/* Title */}
      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--foreground)",
          }}
        >
          {queueData.label}
        </div>
        {queueData.description && (
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
            {queueData.description}
          </div>
        )}
      </div>

      {/* Config */}
      <div style={{ padding: "8px 12px" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            fontSize: 11,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              color: "var(--secondary)",
            }}
          >
            <span>Delivery</span>
            <span
              style={{
                color: deliveryColors[queueData.delivery],
                fontFamily: "monospace",
              }}
            >
              {queueData.delivery.replace(/_/g, " ")}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              color: "var(--secondary)",
            }}
          >
            <span>Max Retries</span>
            <span style={{ fontFamily: "monospace" }}>
              {queueData.retry.maxAttempts}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              color: "var(--secondary)",
            }}
          >
            <span>Backoff</span>
            <span style={{ fontFamily: "monospace" }}>
              {queueData.retry.backoff}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              color: "var(--secondary)",
            }}
          >
            <span>Dead Letter</span>
            <span
              style={{ color: queueData.deadLetter ? "#4ade80" : "#ef4444" }}
            >
              {queueData.deadLetter ? "✓ Enabled" : "✗ Disabled"}
            </span>
          </div>
        </div>
      </div>

      {/* Handles */}
      <Handle
        type="target"
        position={Position.Left}
        id="publish"
        style={{
          width: 10,
          height: 10,
          background: "#facc15",
          border: "2px solid var(--panel)",
          top: "40%",
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="consume"
        style={{
          width: 10,
          height: 10,
          background: "#4ade80",
          border: "2px solid var(--panel)",
          top: "40%",
        }}
      />
      {queueData.deadLetter && (
        <Handle
          type="source"
          position={Position.Right}
          id="dlq"
          style={{
            width: 10,
            height: 10,
            background: "#ef4444",
            border: "2px solid var(--panel)",
            top: "70%",
          }}
        />
      )}
    </div>
  );
});

QueueNode.displayName = "QueueNode";
