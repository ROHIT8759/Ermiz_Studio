import React, { memo, useMemo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { DatabaseBlock } from "@/lib/schema/node";
import { estimateDatabaseMonthlyCost } from "@/lib/cost-estimator";
import { analyzeDBConnections } from "@/lib/schema/graph";
import { analyzeDatabaseHealth } from "@/lib/db-health-checker";
import { useStore } from "@/store/useStore";

export const DatabaseNode = memo(({ id, data, selected }: NodeProps) => {
  const dbData = data as unknown as DatabaseBlock;
  const nodes = useStore((state) => state.nodes);
  const edges = useStore((state) => state.edges);
  const dbConnectionSummary = useMemo(() => {
    const analysis = analyzeDBConnections({
      nodes: nodes as Array<{
        id: string;
        type?: string;
        data?: Record<string, unknown>;
      }>,
      edges: edges as Array<{ source: string; target: string }>,
    });
    return analysis[id] || null;
  }, [edges, id, nodes]);

  const engineColors: Record<string, string> = {
    postgres: "#336791",
    mysql: "#4479A1",
    mongodb: "#4DB33D",
    redis: "#DC382D",
    sqlite: "#003B57",
  };

  const enabledCapabilities = Object.entries(dbData.capabilities)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name);
  const performance = dbData.performance || {
    connectionPool: { min: 2, max: 20, timeout: 30 },
    readReplicas: { count: 0, regions: [] },
    caching: { enabled: false, strategy: "", ttl: 300 },
    sharding: { enabled: false, strategy: "", partitionKey: "" },
  };
  const advancedPerformanceEnabled =
    performance.readReplicas.count > 0 ||
    performance.caching.enabled ||
    performance.sharding.enabled;
  const backup = dbData.backup || {
    schedule: "",
    retention: { days: 7, maxVersions: 30 },
    pointInTimeRecovery: false,
    multiRegion: { enabled: false, regions: [] },
  };
  const backupConfigured =
    Boolean(backup.schedule) ||
    backup.pointInTimeRecovery ||
    (backup.multiRegion.enabled && backup.multiRegion.regions.length > 0);
  const security = dbData.security || {
    roles: [],
    encryption: { atRest: false, inTransit: false },
    network: { vpcId: "", allowedIPs: [] },
    auditLogging: false,
  };
  const encryptionEnabled =
    security.encryption.atRest || security.encryption.inTransit;
  const loadedTemplate = dbData.loadedTemplate || "";
  const migrations = dbData.migrations || [];
  const appliedMigrations = migrations.filter((migration) => migration.applied);
  const currentSchemaVersion =
    appliedMigrations[appliedMigrations.length - 1]?.version ||
    migrations[migrations.length - 1]?.version ||
    "";
  const costEstimation = dbData.costEstimation || {
    storageGb: 0,
    estimatedIOPS: 0,
    backupSizeGb: 0,
    replicaCount: 0,
  };
  const costEstimate = estimateDatabaseMonthlyCost(dbData.engine, costEstimation);
  const costConfigured =
    costEstimation.storageGb > 0 ||
    costEstimation.estimatedIOPS > 0 ||
    costEstimation.backupSizeGb > 0 ||
    costEstimation.replicaCount > 0;
  const monitoring = dbData.monitoring || {
    thresholds: {
      cpuPercent: 80,
      memoryPercent: 80,
      connectionCount: 200,
      queryLatencyMs: 250,
    },
    alerts: [],
    slaTargets: {
      uptimePercent: 99.9,
      maxLatencyMs: 300,
    },
  };
  const monitoringConfigured =
    (monitoring.alerts || []).length > 0 ||
    monitoring.thresholds.cpuPercent !== 80 ||
    monitoring.thresholds.memoryPercent !== 80 ||
    monitoring.thresholds.connectionCount !== 200 ||
    monitoring.thresholds.queryLatencyMs !== 250 ||
    monitoring.slaTargets.uptimePercent !== 99.9 ||
    monitoring.slaTargets.maxLatencyMs !== 300;
  const hasSeeds = (dbData.seeds || []).length > 0;
  const schemaChangeCount = (dbData.schemaHistory || []).length;
  const healthReport = useMemo(() => analyzeDatabaseHealth(dbData), [dbData]);
  const healthTone =
    healthReport.score >= 90
      ? { icon: "??", color: "#4bbf73" }
      : healthReport.score >= 70
        ? { icon: "??", color: "#d8b24a" }
        : { icon: "??", color: "#d16b6b" };
  const environmentKeys = ["dev", "staging", "production"] as const;
  const configuredEnvironmentCount = environmentKeys.reduce((count, envKey) => {
    const environmentData = (dbData.environments?.[envKey] || {}) as {
      connectionString?: string;
      provider?: { region?: string };
      region?: string;
      overrides?: { enabled?: boolean };
    };
    const region = environmentData.provider?.region || environmentData.region || "";
    const isConfigured =
      Boolean(environmentData.connectionString) ||
      Boolean(region) ||
      Boolean(environmentData.overrides?.enabled);
    return count + (isConfigured ? 1 : 0);
  }, 0);

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
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderBottom: "1px solid var(--border)",
          background: engineColors[dbData.engine || ""] || "var(--floating)",
          borderRadius: "8px 8px 0 0",
        }}
      >
        <span style={{ fontSize: 14 }}>🗄️</span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: "uppercase",
            color: "white",
            letterSpacing: "0.05em",
          }}
        >
          {dbData.dbType.toUpperCase()}
        </span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.92)" }}>
          {encryptionEnabled ? "🔒" : "🔓"}
        </span>
        {monitoringConfigured && (
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.92)" }}>📊</span>
        )}
        {hasSeeds && (
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.92)" }}>🌱</span>
        )}
        {dbData.engine && (
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.7)" }}>
            {dbData.engine}
          </span>
        )}
        {advancedPerformanceEnabled && (
          <span
            style={{
              marginLeft: "auto",
              border: "1px solid rgba(255,255,255,0.35)",
              borderRadius: 999,
              padding: "1px 6px",
              fontSize: 9,
              color: "rgba(255,255,255,0.9)",
            }}
          >
            PERF
          </span>
        )}
        {backupConfigured && (
          <span
            style={{
              border: "1px solid rgba(255,255,255,0.35)",
              borderRadius: 999,
              padding: "1px 6px",
              fontSize: 9,
              color: "rgba(255,255,255,0.9)",
            }}
          >
            BACKUP
          </span>
        )}
        {configuredEnvironmentCount > 0 && (
          <span
            style={{
              border: "1px solid rgba(255,255,255,0.35)",
              borderRadius: 999,
              padding: "1px 6px",
              fontSize: 9,
              color: "rgba(255,255,255,0.9)",
            }}
          >
            {configuredEnvironmentCount} envs
          </span>
        )}
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
          {dbData.label}
        </div>
        {dbData.description && (
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
            {dbData.description}
          </div>
        )}
        {loadedTemplate && (
          <div
            style={{
              marginTop: 6,
              fontSize: 10,
              color: "var(--secondary)",
              border: "1px solid var(--border)",
              borderRadius: 999,
              padding: "2px 8px",
              display: "inline-flex",
            }}
          >
            Template: {loadedTemplate}
          </div>
        )}
        {currentSchemaVersion && (
          <div
            style={{
              marginTop: 6,
              fontSize: 10,
              color: "var(--muted)",
              border: "1px solid var(--border)",
              borderRadius: 999,
              padding: "2px 8px",
              display: "inline-flex",
              marginLeft: 6,
            }}
          >
            Schema {currentSchemaVersion}
          </div>
        )}
      </div>

      {/* Capabilities */}
      {enabledCapabilities.length > 0 && (
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
            Capabilities
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "4px 8px",
            }}
          >
            {enabledCapabilities.map((cap) => {
              const icons: Record<string, string> = {
                crud: "📝",
                transactions: "🔄",
                joins: "🔗",
                aggregations: "📊",
                indexes: "🔍",
                constraints: "🔐",
                pagination: "📖",
              };
              return (
                <span
                  key={cap}
                  style={{
                    fontSize: 10,
                    color: "var(--secondary)",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <span>{icons[cap] || "✓"}</span>
                  <span style={{ textTransform: "capitalize" }}>{cap}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Schemas */}
      {dbData.schemas.length > 0 && (
        <div style={{ padding: "8px 12px" }}>
          <div
            style={{
              fontSize: 10,
              color: "var(--muted)",
              marginBottom: 6,
              textTransform: "uppercase",
            }}
          >
            Schemas
          </div>
          {dbData.schemas.map((schema, i) => (
            <div
              key={i}
              style={{
                fontSize: 11,
                color: "var(--secondary)",
                fontFamily: "monospace",
                marginBottom: 2,
              }}
            >
              📋 {schema}
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          padding: "8px 12px",
          borderTop: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          fontSize: 10,
          color: "var(--muted)",
        }}
      >
        <span
          style={{
            border: "1px solid var(--border)",
            borderRadius: 999,
            padding: "1px 7px",
            background: "var(--floating)",
            whiteSpace: "nowrap",
          }}
        >
          📋 {dbData.tables?.length || 0} tables
        </span>
        <span>Relations: {dbData.relationships?.length || 0}</span>
        {dbConnectionSummary && (
          <span
            style={{
              border: "1px solid var(--border)",
              borderRadius: 999,
              padding: "1px 7px",
              color: "var(--muted)",
              background: "var(--floating)",
              whiteSpace: "nowrap",
            }}
          >
            {dbConnectionSummary.connectionCount} connections
          </span>
        )}
        {costConfigured && (
          <span
            style={{
              border: "1px solid var(--border)",
              borderRadius: 999,
              padding: "1px 7px",
              color: "var(--muted)",
              background: "var(--floating)",
              whiteSpace: "nowrap",
            }}
          >
            {costEstimate.formattedMonthlyEstimate}
          </span>
        )}
        {schemaChangeCount > 0 && (
          <span
            style={{
              border: "1px solid var(--border)",
              borderRadius: 999,
              padding: "1px 7px",
              color: "var(--muted)",
              background: "var(--floating)",
              whiteSpace: "nowrap",
            }}
          >
            ?? {schemaChangeCount} changes
          </span>
        )}
        <span
          style={{
            border: "1px solid var(--border)",
            borderRadius: 999,
            padding: "1px 7px",
            color: healthTone.color,
            background: "var(--floating)",
            whiteSpace: "nowrap",
            fontWeight: 600,
          }}
        >
          {healthTone.icon} {healthReport.score}
        </span>
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
          background: engineColors[dbData.engine || ""] || "var(--primary)",
          border: "2px solid var(--panel)",
        }}
      />
    </div>
  );
});

DatabaseNode.displayName = "DatabaseNode";


