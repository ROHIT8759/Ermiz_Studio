"use client";

import React, { useState } from "react";
import { DatabaseBlock } from "@/lib/schema/node";

type MonitoringSectionProps = {
  database: DatabaseBlock;
  onChange: (updates: Partial<DatabaseBlock>) => void;
  inputStyle: React.CSSProperties;
  selectStyle: React.CSSProperties;
  sectionStyle: React.CSSProperties;
};

export function MonitoringSection({
  database,
  onChange,
  inputStyle,
  selectStyle,
  sectionStyle,
}: MonitoringSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [alertConditionDraft, setAlertConditionDraft] = useState("");
  const [alertChannelDraft, setAlertChannelDraft] = useState("email");
  const [alertRecipientsDraft, setAlertRecipientsDraft] = useState("");

  const monitoring = database.monitoring || {
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
        <span>Monitoring & SLA</span>
      </button>

      {isExpanded && (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "grid", gap: 6 }}>
            {[
              {
                key: "cpuPercent",
                label: "CPU Threshold",
                min: 40,
                max: 100,
                unit: "%",
              },
              {
                key: "memoryPercent",
                label: "Memory Threshold",
                min: 40,
                max: 100,
                unit: "%",
              },
              {
                key: "connectionCount",
                label: "Connection Threshold",
                min: 20,
                max: 1000,
                unit: "",
              },
              {
                key: "queryLatencyMs",
                label: "Latency Threshold",
                min: 50,
                max: 2000,
                unit: "ms",
              },
            ].map((item) => {
              const value = monitoring.thresholds[
                item.key as keyof typeof monitoring.thresholds
              ] as number;
              const ratio = (value - item.min) / (item.max - item.min);
              const tint =
                ratio > 0.75
                  ? "#f59e0b"
                  : ratio > 0.5
                    ? "#eab308"
                    : "var(--muted)";
              return (
                <div key={item.key} style={{ display: "grid", gap: 4 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 11,
                      color: "var(--muted)",
                    }}
                  >
                    <span>{item.label}</span>
                    <span style={{ color: tint }}>
                      {value}
                      {item.unit}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={item.min}
                    max={item.max}
                    value={value}
                    onChange={(e) =>
                      onChange({
                        monitoring: {
                          ...monitoring,
                          thresholds: {
                            ...monitoring.thresholds,
                            [item.key]: Number(e.target.value) || item.min,
                          },
                        },
                      })
                    }
                    style={{ width: "100%" }}
                  />
                </div>
              );
            })}
          </div>

          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8, display: "grid", gap: 6 }}>
            <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase" }}>
              Alert Rules
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.8fr 1.6fr auto", gap: 6 }}>
              <input
                value={alertConditionDraft}
                onChange={(e) => setAlertConditionDraft(e.target.value)}
                placeholder="if cpuPercent > 85"
                style={inputStyle}
              />
              <select
                value={alertChannelDraft}
                onChange={(e) => setAlertChannelDraft(e.target.value)}
                style={selectStyle}
              >
                <option value="email">email</option>
                <option value="slack">slack</option>
                <option value="pagerduty">pagerduty</option>
                <option value="webhook">webhook</option>
              </select>
              <input
                value={alertRecipientsDraft}
                onChange={(e) => setAlertRecipientsDraft(e.target.value)}
                placeholder="ops@example.com, dev@example.com"
                style={inputStyle}
              />
              <button
                type="button"
                onClick={() => {
                  const condition = alertConditionDraft.trim();
                  if (!condition) return;
                  const recipients = alertRecipientsDraft
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean);
                  onChange({
                    monitoring: {
                      ...monitoring,
                      alerts: [
                        ...(monitoring.alerts || []),
                        {
                          condition,
                          channel: alertChannelDraft,
                          recipients,
                        },
                      ],
                    },
                  });
                  setAlertConditionDraft("");
                  setAlertRecipientsDraft("");
                }}
                style={{
                  border: "1px solid var(--border)",
                  background: "var(--floating)",
                  color: "var(--foreground)",
                  borderRadius: 4,
                  padding: "4px 8px",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                Add
              </button>
            </div>
            {(monitoring.alerts || []).map((alert, index) => (
              <div
                key={`${alert.condition}-${index}`}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  background: "var(--panel)",
                  padding: "5px 8px",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 11,
                }}
              >
                <span style={{ color: "var(--foreground)" }}>{alert.condition}</span>
                <span style={{ color: "var(--muted)" }}>via {alert.channel}</span>
                <span
                  style={{
                    color: "var(--muted)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {(alert.recipients || []).join(", ")}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      monitoring: {
                        ...monitoring,
                        alerts: (monitoring.alerts || []).filter((_, i) => i !== index),
                      },
                    })
                  }
                  style={{
                    marginLeft: "auto",
                    border: "1px solid var(--border)",
                    background: "transparent",
                    color: "var(--muted)",
                    borderRadius: 4,
                    padding: "2px 6px",
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  x
                </button>
              </div>
            ))}
          </div>

          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
            <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", marginBottom: 6 }}>
              SLA Targets
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <input
                type="number"
                min={90}
                max={100}
                step={0.1}
                value={monitoring.slaTargets.uptimePercent}
                onChange={(e) =>
                  onChange({
                    monitoring: {
                      ...monitoring,
                      slaTargets: {
                        ...monitoring.slaTargets,
                        uptimePercent: Number(e.target.value) || 99.9,
                      },
                    },
                  })
                }
                placeholder="Uptime %"
                style={inputStyle}
              />
              <input
                type="number"
                min={1}
                value={monitoring.slaTargets.maxLatencyMs}
                onChange={(e) =>
                  onChange({
                    monitoring: {
                      ...monitoring,
                      slaTargets: {
                        ...monitoring.slaTargets,
                        maxLatencyMs: Math.max(1, Number(e.target.value) || 1),
                      },
                    },
                  })
                }
                placeholder="Max Latency (ms)"
                style={inputStyle}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

