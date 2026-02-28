"use client";

import React from "react";
import { DatabaseBlock } from "@/lib/schema/node";
import { estimateDatabaseMonthlyCost } from "@/lib/cost-estimator";

type PerformanceSectionProps = {
  database: DatabaseBlock;
  onChange: (updates: Partial<DatabaseBlock>) => void;
  inputStyle: React.CSSProperties;
  labelStyle: React.CSSProperties;
  sectionStyle: React.CSSProperties;
};

export function PerformanceSection({
  database,
  onChange,
  inputStyle,
  labelStyle,
  sectionStyle,
}: PerformanceSectionProps) {
  const performance = database.performance || {
    connectionPool: { min: 2, max: 20, timeout: 30 },
    readReplicas: { count: 0, regions: [] },
    caching: { enabled: false, strategy: "", ttl: 300 },
    sharding: { enabled: false, strategy: "", partitionKey: "" },
  };
  const costEstimation = database.costEstimation || {
    storageGb: 0,
    estimatedIOPS: 0,
    backupSizeGb: 0,
    replicaCount: 0,
  };
  const monthlyCost = estimateDatabaseMonthlyCost(database.engine, costEstimation);

  return (
    <>
      <div style={sectionStyle}>
        <div style={labelStyle}>Performance & Scaling</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
          <input
            type="number"
            min={0}
            value={performance.connectionPool.min}
            onChange={(e) =>
              onChange({
                performance: {
                  ...performance,
                  connectionPool: {
                    ...performance.connectionPool,
                    min: Math.max(0, Number(e.target.value) || 0),
                  },
                },
              })
            }
            placeholder="Pool Min"
            style={inputStyle}
          />
          <input
            type="number"
            min={1}
            value={performance.connectionPool.max}
            onChange={(e) =>
              onChange({
                performance: {
                  ...performance,
                  connectionPool: {
                    ...performance.connectionPool,
                    max: Math.max(1, Number(e.target.value) || 1),
                  },
                },
              })
            }
            placeholder="Pool Max"
            style={inputStyle}
          />
          <input
            type="number"
            min={0}
            value={performance.connectionPool.timeout}
            onChange={(e) =>
              onChange({
                performance: {
                  ...performance,
                  connectionPool: {
                    ...performance.connectionPool,
                    timeout: Math.max(0, Number(e.target.value) || 0),
                  },
                },
              })
            }
            placeholder="Pool Timeout"
            style={inputStyle}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6 }}>
          <input
            type="number"
            min={0}
            value={performance.readReplicas.count}
            onChange={(e) =>
              onChange({
                performance: {
                  ...performance,
                  readReplicas: {
                    ...performance.readReplicas,
                    count: Math.max(0, Number(e.target.value) || 0),
                  },
                },
              })
            }
            placeholder="Read Replicas"
            style={inputStyle}
          />
          <input
            type="text"
            value={(performance.readReplicas.regions || []).join(", ")}
            onChange={(e) =>
              onChange({
                performance: {
                  ...performance,
                  readReplicas: {
                    ...performance.readReplicas,
                    regions: e.target.value
                      .split(",")
                      .map((region) => region.trim())
                      .filter(Boolean),
                  },
                },
              })
            }
            placeholder="Replica regions"
            style={inputStyle}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr", gap: 6, marginTop: 6, alignItems: "center" }}>
          <label style={{ fontSize: 11, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={performance.caching.enabled}
              onChange={(e) =>
                onChange({
                  performance: {
                    ...performance,
                    caching: {
                      ...performance.caching,
                      enabled: e.target.checked,
                    },
                  },
                })
              }
            />
            Cache
          </label>
          <input
            type="text"
            value={performance.caching.strategy}
            onChange={(e) =>
              onChange({
                performance: {
                  ...performance,
                  caching: {
                    ...performance.caching,
                    strategy: e.target.value,
                  },
                },
              })
            }
            placeholder="Caching strategy"
            style={inputStyle}
          />
          <input
            type="number"
            min={0}
            value={performance.caching.ttl}
            onChange={(e) =>
              onChange({
                performance: {
                  ...performance,
                  caching: {
                    ...performance.caching,
                    ttl: Math.max(0, Number(e.target.value) || 0),
                  },
                },
              })
            }
            placeholder="Cache TTL"
            style={inputStyle}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr", gap: 6, marginTop: 6, alignItems: "center" }}>
          <label style={{ fontSize: 11, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={performance.sharding.enabled}
              onChange={(e) =>
                onChange({
                  performance: {
                    ...performance,
                    sharding: {
                      ...performance.sharding,
                      enabled: e.target.checked,
                    },
                  },
                })
              }
            />
            Shard
          </label>
          <input
            type="text"
            value={performance.sharding.strategy}
            onChange={(e) =>
              onChange({
                performance: {
                  ...performance,
                  sharding: {
                    ...performance.sharding,
                    strategy: e.target.value,
                  },
                },
              })
            }
            placeholder="Sharding strategy"
            style={inputStyle}
          />
          <input
            type="text"
            value={performance.sharding.partitionKey}
            onChange={(e) =>
              onChange({
                performance: {
                  ...performance,
                  sharding: {
                    ...performance.sharding,
                    partitionKey: e.target.value,
                  },
                },
              })
            }
            placeholder="Partition key"
            style={inputStyle}
          />
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={labelStyle}>Resource Planning</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <input
            type="number"
            min={0}
            value={costEstimation.storageGb}
            onChange={(e) =>
              onChange({
                costEstimation: {
                  ...costEstimation,
                  storageGb: Math.max(0, Number(e.target.value) || 0),
                },
              })
            }
            placeholder="Storage (GB)"
            style={inputStyle}
          />
          <input
            type="number"
            min={0}
            value={costEstimation.estimatedIOPS}
            onChange={(e) =>
              onChange({
                costEstimation: {
                  ...costEstimation,
                  estimatedIOPS: Math.max(0, Number(e.target.value) || 0),
                },
              })
            }
            placeholder="Estimated IOPS"
            style={inputStyle}
          />
          <input
            type="number"
            min={0}
            value={costEstimation.backupSizeGb}
            onChange={(e) =>
              onChange({
                costEstimation: {
                  ...costEstimation,
                  backupSizeGb: Math.max(0, Number(e.target.value) || 0),
                },
              })
            }
            placeholder="Backup Size (GB)"
            style={inputStyle}
          />
          <input
            type="number"
            min={0}
            value={costEstimation.replicaCount}
            onChange={(e) =>
              onChange({
                costEstimation: {
                  ...costEstimation,
                  replicaCount: Math.max(0, Number(e.target.value) || 0),
                },
              })
            }
            placeholder="Replica Count"
            style={inputStyle}
          />
        </div>
        <div
          style={{
            marginTop: 8,
            border: "1px solid var(--border)",
            borderRadius: 6,
            background: "var(--panel)",
            padding: "8px 10px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 11, color: "var(--muted)" }}>
            Estimated Monthly Cost ({monthlyCost.provider.toUpperCase()})
          </span>
          <span style={{ fontSize: 14, color: "var(--secondary)", fontWeight: 600 }}>
            {monthlyCost.formattedMonthlyEstimate}
          </span>
        </div>
      </div>
    </>
  );
}

