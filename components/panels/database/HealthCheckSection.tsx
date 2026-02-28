"use client";

import React, { useMemo, useState } from "react";
import { DatabaseBlock } from "@/lib/schema/node";
import {
  analyzeDatabaseHealth,
  DatabaseHealthWarning,
} from "@/lib/db-health-checker";

type HealthCheckSectionProps = {
  database: DatabaseBlock;
  onChange: (updates: Partial<DatabaseBlock>) => void;
  sectionStyle: React.CSSProperties;
};

const severityColor: Record<DatabaseHealthWarning["severity"], string> = {
  info: "var(--muted)",
  warning: "#c9a14a",
  error: "#db6a6a",
};

const scoreTone = (score: number) => {
  if (score >= 90) return { icon: "🟢", color: "#4bbf73" };
  if (score >= 70) return { icon: "🟡", color: "#d8b24a" };
  return { icon: "🔴", color: "#d16b6b" };
};

const applyQuickFix = (
  warning: DatabaseHealthWarning,
  database: DatabaseBlock,
  onChange: (updates: Partial<DatabaseBlock>) => void,
) => {
  if (warning.code === "backup_not_configured") {
    onChange({
      backup: {
        ...database.backup,
        schedule: database.backup.schedule || "0 2 * * *",
        pointInTimeRecovery: true,
      },
    });
    return;
  }

  if (warning.code === "encryption_disabled_production") {
    onChange({
      security: {
        ...database.security,
        encryption: {
          ...database.security.encryption,
          atRest: true,
          inTransit: true,
        },
      },
    });
    return;
  }

  if (warning.code === "monitoring_thresholds_missing") {
    onChange({
      monitoring: {
        ...database.monitoring,
        thresholds: {
          cpuPercent: 80,
          memoryPercent: 80,
          connectionCount: 200,
          queryLatencyMs: 250,
        },
      },
    });
    return;
  }

  if (
    warning.code === "connection_pool_too_small" ||
    warning.code === "connection_pool_too_large"
  ) {
    const recommended = (warning.details?.recommended || {}) as {
      min?: number;
      max?: number;
    };
    if (!recommended.min || !recommended.max) return;
    onChange({
      performance: {
        ...database.performance,
        connectionPool: {
          ...database.performance.connectionPool,
          min: recommended.min,
          max: recommended.max,
        },
      },
    });
    return;
  }

  if (warning.code === "query_without_conditions") {
    const queryId = String(warning.details?.queryId || "");
    if (!queryId) return;
    onChange({
      queries: (database.queries || []).map((query) =>
        query.id === queryId ? { ...query, conditions: "id = :id" } : query,
      ),
    });
    return;
  }

  if (warning.code === "foreign_key_missing_index") {
    const tableName = String(warning.details?.tableName || "");
    const fieldName = String(warning.details?.fieldName || "");
    if (!tableName || !fieldName) return;
    onChange({
      tables: (database.tables || []).map((table) =>
        table.name === tableName
          ? {
              ...table,
              indexes: Array.from(new Set([...(table.indexes || []), fieldName])),
            }
          : table,
      ),
    });
    return;
  }

  if (warning.code === "table_without_primary_key") {
    const tableName = String(warning.details?.tableName || "");
    if (!tableName) return;
    onChange({
      tables: (database.tables || []).map((table) => {
        if (table.name !== tableName) return table;
        const hasPk = (table.fields || []).some((field) => field.isPrimaryKey);
        if (hasPk) return table;
        return {
          ...table,
          fields: [
            ...(table.fields || []),
            {
              name: "id",
              type: "uuid",
              nullable: false,
              isPrimaryKey: true,
            },
          ],
        };
      }),
    });
  }
};

const quickFixLabel = (warning: DatabaseHealthWarning): string | null => {
  switch (warning.code) {
    case "backup_not_configured":
      return "Enable backup";
    case "encryption_disabled_production":
      return "Enable encryption";
    case "monitoring_thresholds_missing":
      return "Set thresholds";
    case "connection_pool_too_small":
    case "connection_pool_too_large":
      return "Apply pool size";
    case "query_without_conditions":
      return "Add filter";
    case "foreign_key_missing_index":
      return "Add index";
    case "table_without_primary_key":
      return "Add id PK";
    default:
      return null;
  }
};

export function HealthCheckSection({
  database,
  onChange,
  sectionStyle,
}: HealthCheckSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const report = useMemo(() => analyzeDatabaseHealth(database), [database]);
  const tone = scoreTone(report.score);

  return (
    <div style={sectionStyle}>
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        style={{
          border: "none",
          background: "transparent",
          color: "var(--muted)",
          padding: 0,
          cursor: "pointer",
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: isExpanded ? 8 : 0,
        }}
      >
        <span>{isExpanded ? "â–¾" : "â–¸"}</span>
        <span>Health Check</span>
      </button>

      {isExpanded && (
        <div style={{ display: "grid", gap: 8 }}>
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 6,
              background: "var(--floating)",
              padding: "8px 10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontSize: 11, color: "var(--muted)" }}>Overall health score</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: tone.color }}>
              {tone.icon} {report.score}
            </span>
          </div>

          {report.warnings.length === 0 && (
            <div style={{ fontSize: 11, color: "var(--secondary)" }}>
              No health warnings detected.
            </div>
          )}

          {report.warnings.length > 0 && (
            <div style={{ display: "grid", gap: 6 }}>
              {report.warnings.map((warning, index) => {
                const actionLabel = quickFixLabel(warning);
                return (
                  <div
                    key={`${warning.code}-${warning.target || index}`}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      background: "var(--floating)",
                      padding: "6px 8px",
                      display: "grid",
                      gap: 5,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, color: severityColor[warning.severity], textTransform: "uppercase" }}>
                        {warning.severity}
                      </span>
                      {actionLabel && (
                        <button
                          type="button"
                          onClick={() => applyQuickFix(warning, database, onChange)}
                          style={{
                            border: "1px solid var(--border)",
                            borderRadius: 4,
                            background: "var(--panel)",
                            color: "var(--foreground)",
                            padding: "2px 6px",
                            fontSize: 10,
                            cursor: "pointer",
                          }}
                        >
                          {actionLabel}
                        </button>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--foreground)" }}>{warning.message}</div>
                    {warning.recommendation && (
                      <div style={{ fontSize: 10, color: "var(--muted)" }}>
                        Recommendation: {warning.recommendation}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {report.recommendations.length > 0 && (
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 6,
                background: "var(--panel)",
                padding: "8px 10px",
                display: "grid",
                gap: 4,
              }}
            >
              <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase" }}>Optimization tips</div>
              {report.recommendations.map((recommendation) => (
                <div key={recommendation} style={{ fontSize: 11, color: "var(--foreground)" }}>
                  - {recommendation}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

