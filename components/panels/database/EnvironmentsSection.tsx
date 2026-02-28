"use client";

import React, { useMemo, useState } from "react";
import { DatabaseBlock } from "@/lib/schema/node";
import { estimateDatabaseMonthlyCost } from "@/lib/cost-estimator";

type DatabaseEnvironmentKey = "dev" | "staging" | "production";
type DatabaseTier = "small" | "medium" | "large";

const performanceTierPresets: Record<
  DatabaseTier,
  { connectionPool: { min: number; max: number; timeout: number }; readReplicas: { count: number; regions: string[] } }
> = {
  small: {
    connectionPool: { min: 2, max: 10, timeout: 30 },
    readReplicas: { count: 0, regions: [] },
  },
  medium: {
    connectionPool: { min: 4, max: 24, timeout: 30 },
    readReplicas: { count: 1, regions: [] },
  },
  large: {
    connectionPool: { min: 8, max: 48, timeout: 30 },
    readReplicas: { count: 2, regions: [] },
  },
};

const environmentCostMultiplier: Record<DatabaseEnvironmentKey, number> = {
  dev: 0.5,
  staging: 0.8,
  production: 1.2,
};

type EnvironmentsSectionProps = {
  database: DatabaseBlock;
  onChange: (updates: Partial<DatabaseBlock>) => void;
  inputStyle: React.CSSProperties;
  selectStyle: React.CSSProperties;
  sectionStyle: React.CSSProperties;
};

const defaultEnvironments: DatabaseBlock["environments"] = {
  dev: {
    connectionString: "",
    provider: { region: "" },
    performanceTier: "small",
    overrides: { enabled: false },
  },
  staging: {
    connectionString: "",
    provider: { region: "" },
    performanceTier: "medium",
    overrides: { enabled: false },
  },
  production: {
    connectionString: "",
    provider: { region: "" },
    performanceTier: "large",
    overrides: { enabled: false },
  },
};

const normalizeEnvironmentConfig = (
  raw: Record<string, unknown> | undefined,
  fallback: DatabaseBlock["environments"][DatabaseEnvironmentKey],
) => {
  const provider = (raw?.provider as Record<string, unknown> | undefined) || {};
  const legacyRegion = typeof raw?.region === "string" ? raw.region : "";
  return {
    connectionString:
      typeof raw?.connectionString === "string" ? raw.connectionString : fallback.connectionString,
    provider: {
      region: typeof provider.region === "string" ? provider.region : legacyRegion || fallback.provider.region,
    },
    performanceTier:
      raw?.performanceTier === "small" || raw?.performanceTier === "medium" || raw?.performanceTier === "large"
        ? raw.performanceTier
        : fallback.performanceTier,
    overrides:
      typeof raw?.overrides === "object" && raw.overrides
        ? {
            enabled: Boolean((raw.overrides as Record<string, unknown>).enabled),
            performance: (raw.overrides as Record<string, unknown>).performance as
              | DatabaseBlock["performance"]
              | undefined,
            backup: (raw.overrides as Record<string, unknown>).backup as DatabaseBlock["backup"] | undefined,
            monitoring: (raw.overrides as Record<string, unknown>).monitoring as
              | DatabaseBlock["monitoring"]
              | undefined,
          }
        : fallback.overrides,
  };
};

export function EnvironmentsSection({
  database,
  onChange,
  inputStyle,
  selectStyle,
  sectionStyle,
}: EnvironmentsSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<DatabaseEnvironmentKey>("dev");

  const environments = useMemo(
    () => ({
      dev: normalizeEnvironmentConfig(
        database.environments?.dev as unknown as Record<string, unknown> | undefined,
        defaultEnvironments.dev,
      ),
      staging: normalizeEnvironmentConfig(
        database.environments?.staging as unknown as Record<string, unknown> | undefined,
        defaultEnvironments.staging,
      ),
      production: normalizeEnvironmentConfig(
        database.environments?.production as unknown as Record<string, unknown> | undefined,
        defaultEnvironments.production,
      ),
    }),
    [database.environments],
  );
  const activeEnvironment = environments[activeTab];
  const basePerformance = database.performance;
  const baseBackup = database.backup;
  const baseMonitoring = database.monitoring;
  const baseCost = database.costEstimation;

  const updateEnvironmentConfig = (
    env: DatabaseEnvironmentKey,
    updater: (current: (typeof environments)[DatabaseEnvironmentKey]) => (typeof environments)[DatabaseEnvironmentKey],
  ) => {
    onChange({
      environments: {
        ...environments,
        [env]: updater(environments[env]),
      },
    });
  };

  const getEnvironmentCostEstimate = (env: DatabaseEnvironmentKey) => {
    const envConfig = environments[env];
    const tierMultiplier = environmentCostMultiplier[env];
    const effectivePerformance =
      envConfig.overrides.enabled && envConfig.overrides.performance
        ? envConfig.overrides.performance
        : undefined;
    return estimateDatabaseMonthlyCost(database.engine, {
      storageGb: Math.round((baseCost?.storageGb || 0) * tierMultiplier),
      estimatedIOPS: Math.round((baseCost?.estimatedIOPS || 0) * tierMultiplier),
      backupSizeGb: Math.round((baseCost?.backupSizeGb || 0) * tierMultiplier),
      replicaCount:
        effectivePerformance?.readReplicas.count ??
        Math.max(
          baseCost?.replicaCount || 0,
          performanceTierPresets[(envConfig.performanceTier || "small") as DatabaseTier].readReplicas.count,
        ),
    });
  };

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
        <span>{isExpanded ? "▾" : "▸"}</span>
        <span>Environments</span>
      </button>

      {isExpanded && (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            {(["dev", "staging", "production"] as DatabaseEnvironmentKey[]).map((env) => {
              const isActive = activeTab === env;
              const envConfig = environments[env];
              const isConfigured =
                Boolean(envConfig.connectionString) ||
                Boolean(envConfig.provider.region) ||
                Boolean(envConfig.overrides?.enabled);
              return (
                <button
                  key={env}
                  type="button"
                  onClick={() => setActiveTab(env)}
                  style={{
                    border: "1px solid var(--border)",
                    background: isActive
                      ? "color-mix(in srgb, var(--primary) 16%, var(--floating) 84%)"
                      : "var(--floating)",
                    color: "var(--foreground)",
                    borderRadius: 4,
                    padding: "6px 8px",
                    fontSize: 11,
                    textTransform: "capitalize",
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span>{env}</span>
                  {isConfigured && <span style={{ color: "var(--secondary)" }}>set</span>}
                </button>
              );
            })}
          </div>

          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 6,
              background: "var(--floating)",
              padding: 8,
              display: "grid",
              gap: 6,
            }}
          >
            <label
              style={{
                fontSize: 11,
                color: "var(--muted)",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <input
                type="checkbox"
                checked={Boolean(activeEnvironment.overrides?.enabled)}
                onChange={(e) => {
                  const enabled = e.target.checked;
                  updateEnvironmentConfig(activeTab, (current) => ({
                    ...current,
                    overrides: {
                      ...current.overrides,
                      enabled,
                      performance: current.overrides?.performance || basePerformance,
                      backup: current.overrides?.backup || baseBackup,
                      monitoring: current.overrides?.monitoring || baseMonitoring,
                    },
                  }));
                }}
              />
              Enable environment-specific overrides
            </label>

            <input
              type="text"
              value={activeEnvironment.connectionString}
              onChange={(e) =>
                updateEnvironmentConfig(activeTab, (current) => ({
                  ...current,
                  connectionString: e.target.value,
                }))
              }
              placeholder="Connection string"
              style={inputStyle}
            />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <input
                type="text"
                value={activeEnvironment.provider.region}
                onChange={(e) =>
                  updateEnvironmentConfig(activeTab, (current) => ({
                    ...current,
                    provider: {
                      ...current.provider,
                      region: e.target.value,
                    },
                  }))
                }
                placeholder="Provider region"
                style={inputStyle}
              />
              <select
                value={activeEnvironment.performanceTier}
                onChange={(e) => {
                  const tier = e.target.value as DatabaseTier;
                  const preset = performanceTierPresets[tier];
                  updateEnvironmentConfig(activeTab, (current) => ({
                    ...current,
                    performanceTier: tier,
                    overrides: {
                      ...current.overrides,
                      enabled: true,
                      performance: {
                        connectionPool: preset.connectionPool,
                        readReplicas: preset.readReplicas,
                        caching: current.overrides?.performance?.caching || basePerformance.caching,
                        sharding:
                          current.overrides?.performance?.sharding || basePerformance.sharding,
                      },
                      backup: current.overrides?.backup || baseBackup,
                      monitoring: current.overrides?.monitoring || baseMonitoring,
                    },
                  }));
                }}
                style={selectStyle}
              >
                <option value="small">small tier</option>
                <option value="medium">medium tier</option>
                <option value="large">large tier</option>
              </select>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>
                Pool:{" "}
                {activeEnvironment.overrides?.performance
                  ? `${activeEnvironment.overrides.performance.connectionPool.min}-${activeEnvironment.overrides.performance.connectionPool.max}`
                  : `${performanceTierPresets[(activeEnvironment.performanceTier || "small") as DatabaseTier].connectionPool.min}-${performanceTierPresets[(activeEnvironment.performanceTier || "small") as DatabaseTier].connectionPool.max}`}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>
                Replicas:{" "}
                {activeEnvironment.overrides?.performance?.readReplicas.count ??
                  performanceTierPresets[(activeEnvironment.performanceTier || "small") as DatabaseTier].readReplicas.count}
              </div>
            </div>

            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 4,
                background: "var(--panel)",
                padding: "6px 8px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: 11, color: "var(--muted)", textTransform: "capitalize" }}>
                {activeTab} estimate
              </span>
              <span style={{ fontSize: 12, color: "var(--secondary)", fontWeight: 600 }}>
                {getEnvironmentCostEstimate(activeTab).formattedMonthlyEstimate}
              </span>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            {(["dev", "staging", "production"] as DatabaseEnvironmentKey[]).map((env) => (
              <div
                key={env}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  background: "var(--panel)",
                  padding: "6px 8px",
                  display: "grid",
                  gap: 3,
                }}
              >
                <span style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase" }}>
                  {env}
                </span>
                <span style={{ fontSize: 11, color: "var(--secondary)" }}>
                  {getEnvironmentCostEstimate(env).formattedMonthlyEstimate}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
