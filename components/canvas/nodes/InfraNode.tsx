import React, { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { InfraBlock } from "@/lib/schema/node";

const resourceMeta: Record<
  InfraBlock["resourceType"],
  { icon: string; color: string; label: string }
> = {
  ec2: { icon: "🖥️", color: "#60a5fa", label: "EC2" },
  lambda: { icon: "⚡", color: "#facc15", label: "Lambda" },
  eks: { icon: "🧩", color: "#34d399", label: "EKS" },
  vpc: { icon: "🧭", color: "#a78bfa", label: "VPC" },
  s3: { icon: "🪣", color: "#f97316", label: "S3" },
  rds: { icon: "🗄️", color: "#3b82f6", label: "RDS" },
  load_balancer: { icon: "📡", color: "#22d3ee", label: "LB" },
  hpc: { icon: "🚀", color: "#f472b6", label: "HPC" },
};

const summarizeConfig = (data: InfraBlock) => {
  switch (data.resourceType) {
    case "ec2":
      return `${data.config.instanceType} · x${data.config.count}`;
    case "lambda":
      return `${data.config.runtime} · ${data.config.memoryMb}MB`;
    case "eks":
      return `${data.config.version} · ${data.config.nodeType}`;
    case "vpc":
      return data.config.cidr;
    case "s3":
      return data.config.bucketName;
    case "rds":
      return `${data.config.engine} ${data.config.engineVersion}`;
    case "load_balancer":
      return `${data.config.lbType} · ${data.config.scheme}`;
    case "hpc":
      return `${data.config.scheduler} · ${data.config.instanceType}`;
    default:
      return "";
  }
};

export const InfraNode = memo(({ data, selected }: NodeProps) => {
  const infraData = data as InfraBlock;
  const meta = resourceMeta[infraData.resourceType];
  const summary = summarizeConfig(infraData);

  return (
    <div
      style={{
        background: "var(--panel)",
        border: selected
          ? "2px solid var(--primary)"
          : "1px solid var(--border)",
        borderRadius: 8,
        minWidth: 240,
        boxShadow: selected
          ? "0 0 0 2px rgba(124, 108, 255, 0.2)"
          : "0 4px 12px rgba(0, 0, 0, 0.3)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderBottom: "1px solid var(--border)",
          background: meta?.color || "var(--floating)",
          borderRadius: "8px 8px 0 0",
        }}
      >
        <span style={{ fontSize: 14 }}>{meta?.icon || "🧱"}</span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: "uppercase",
            color: "white",
            letterSpacing: "0.05em",
          }}
        >
          {meta?.label || "Infra"}
        </span>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.7)" }}>
          {infraData.provider.toUpperCase()}
        </span>
      </div>

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
          {infraData.label}
        </div>
        {infraData.description && (
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
            {infraData.description}
          </div>
        )}
      </div>

      <div style={{ padding: "8px 12px" }}>
        <div
          style={{
            fontSize: 10,
            color: "var(--muted)",
            marginBottom: 6,
            textTransform: "uppercase",
          }}
        >
          Summary
        </div>
        <div style={{ fontSize: 11, color: "var(--secondary)" }}>{summary}</div>
        <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
          {infraData.region} · {infraData.environment}
        </div>
      </div>

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
          background: meta?.color || "var(--primary)",
          border: "2px solid var(--panel)",
        }}
      />
    </div>
  );
});

InfraNode.displayName = "InfraNode";
