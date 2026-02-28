import React, { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { ProcessDefinition, InputField, OutputField } from "@/lib/schema/node";

export const ProcessNode = memo(({ data, selected }: NodeProps) => {
  const processData = data as unknown as ProcessDefinition;

  const executionLabels: Record<string, string> = {
    sync: "Sync",
    async: "Async",
    scheduled: "⏰",
    event_driven: "⚡",
  };

  return (
    <div
      style={{
        background: "var(--panel)",
        border: selected
          ? "2px solid var(--primary)"
          : "1px solid var(--border)",
        borderRadius: 8,
        minWidth: 280,
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
          justifyContent: "space-between",
          padding: "8px 12px",
          borderBottom: "1px solid var(--border)",
          background: "var(--floating)",
          borderRadius: "8px 8px 0 0",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: "uppercase",
              color: "#a78bfa",
              letterSpacing: "0.05em",
            }}
          >
            Function Block
          </span>
          <span style={{ fontSize: 10, color: "var(--muted)" }}>
            {executionLabels[processData.execution]}
          </span>
        </div>
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
          {processData.label}
        </div>
        {processData.description && (
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
            {processData.description}
          </div>
        )}
      </div>

      {/* Inputs */}
      {processData.inputs.length > 0 && (
        <div
          style={{
            padding: "8px 12px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: "var(--muted)",
              marginBottom: 6,
              textTransform: "uppercase",
            }}
          >
            Inputs
          </div>
          {processData.inputs.map((input: InputField, i: number) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 11,
                marginBottom: 4,
              }}
            >
              <Handle
                type="target"
                position={Position.Left}
                id={`input-${input.name}`}
                style={{
                  position: "relative",
                  left: 0,
                  top: 0,
                  transform: "none",
                  width: 8,
                  height: 8,
                  background: "var(--muted)",
                  border: "none",
                }}
              />
              <span style={{ color: "var(--secondary)" }}>{input.name}</span>
              <span style={{ color: "var(--muted)", fontSize: 10 }}>
                : {input.type}
              </span>
              {input.required && (
                <span style={{ color: "#ef4444", fontSize: 10 }}>*</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Steps */}
      {processData.steps.length > 0 && (
        <div
          style={{
            padding: "8px 12px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: "var(--muted)",
              marginBottom: 6,
              textTransform: "uppercase",
            }}
          >
            Steps ({processData.steps.length})
          </div>
          {processData.steps.slice(0, 3).map((step, i) => (
            <div
              key={step.id}
              style={{
                fontSize: 11,
                color: "var(--secondary)",
                padding: "4px 8px",
                background: "var(--background)",
                borderRadius: 4,
                marginBottom: 4,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span style={{ color: "var(--muted)" }}>{i + 1}.</span>
              <span
                style={{
                  color: "#a78bfa",
                  textTransform: "uppercase",
                  fontSize: 9,
                }}
              >
                {step.kind}
              </span>
              {step.ref && (
                <span style={{ fontFamily: "monospace" }}>{step.ref}</span>
              )}
            </div>
          ))}
          {processData.steps.length > 3 && (
            <div
              style={{
                fontSize: 10,
                color: "var(--muted)",
                textAlign: "center",
              }}
            >
              +{processData.steps.length - 3} more
            </div>
          )}
        </div>
      )}

      {/* Outputs */}
      {(processData.outputs.success.length > 0 ||
        processData.outputs.error.length > 0) && (
        <div style={{ padding: "8px 12px" }}>
          <div
            style={{
              fontSize: 10,
              color: "var(--muted)",
              marginBottom: 6,
              textTransform: "uppercase",
            }}
          >
            Outputs
          </div>
          {processData.outputs.success.map((output: OutputField, i: number) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: 11,
                marginBottom: 4,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: "#4ade80", fontSize: 9 }}>✓</span>
                <span style={{ color: "var(--secondary)" }}>{output.name}</span>
                <span style={{ color: "var(--muted)", fontSize: 10 }}>
                  : {output.type}
                </span>
              </div>
              <Handle
                type="source"
                position={Position.Right}
                id={`output-${output.name}`}
                style={{
                  position: "relative",
                  right: 0,
                  top: 0,
                  transform: "none",
                  width: 8,
                  height: 8,
                  background: "#4ade80",
                  border: "none",
                }}
              />
            </div>
          ))}
          {processData.outputs.error.map((output: OutputField, i: number) => (
            <div
              key={`err-${i}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: 11,
                marginBottom: 4,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: "#ef4444", fontSize: 9 }}>✗</span>
                <span style={{ color: "var(--secondary)" }}>{output.name}</span>
                <span style={{ color: "var(--muted)", fontSize: 10 }}>
                  : {output.type}
                </span>
              </div>
              <Handle
                type="source"
                position={Position.Right}
                id={`error-${output.name}`}
                style={{
                  position: "relative",
                  right: 0,
                  top: 0,
                  transform: "none",
                  width: 8,
                  height: 8,
                  background: "#ef4444",
                  border: "none",
                }}
              />
            </div>
          ))}
        </div>
      )}

      {/* Default handles if no inputs/outputs */}
      {processData.inputs.length === 0 && (
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
      )}
      {processData.outputs.success.length === 0 &&
        processData.outputs.error.length === 0 && (
          <Handle
            type="source"
            position={Position.Right}
            style={{
              width: 10,
              height: 10,
              background: "var(--primary)",
              border: "2px solid var(--panel)",
            }}
          />
        )}
    </div>
  );
});

ProcessNode.displayName = "ProcessNode";
