"use client";

import React, { useState } from "react";
import { DatabaseBlock } from "@/lib/schema/node";

type BackupSectionProps = {
  database: DatabaseBlock;
  onChange: (updates: Partial<DatabaseBlock>) => void;
  inputStyle: React.CSSProperties;
  selectStyle: React.CSSProperties;
  sectionStyle: React.CSSProperties;
};

export function BackupSection({
  database,
  onChange,
  inputStyle,
  selectStyle,
  sectionStyle,
}: BackupSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [backupRegionDraft, setBackupRegionDraft] = useState("");
  const backup = database.backup || {
    schedule: "",
    retention: { days: 7, maxVersions: 30 },
    pointInTimeRecovery: false,
    multiRegion: { enabled: false, regions: [] },
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
        <span>Backup & Recovery</span>
      </button>

      {isExpanded && (
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            <select
              value={backup.schedule}
              onChange={(e) =>
                onChange({
                  backup: {
                    ...backup,
                    schedule: e.target.value,
                  },
                })
              }
              style={selectStyle}
            >
              <option value="">Schedule</option>
              <option value="hourly">hourly</option>
              <option value="daily">daily</option>
              <option value="weekly">weekly</option>
            </select>
            <input
              type="number"
              min={1}
              value={backup.retention.days}
              onChange={(e) =>
                onChange({
                  backup: {
                    ...backup,
                    retention: {
                      ...backup.retention,
                      days: Math.max(1, Number(e.target.value) || 1),
                    },
                  },
                })
              }
              placeholder="Retention Days"
              style={inputStyle}
            />
            <input
              type="number"
              min={1}
              value={backup.retention.maxVersions}
              onChange={(e) =>
                onChange({
                  backup: {
                    ...backup,
                    retention: {
                      ...backup.retention,
                      maxVersions: Math.max(1, Number(e.target.value) || 1),
                    },
                  },
                })
              }
              placeholder="Max Versions"
              style={inputStyle}
            />
          </div>

          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <label style={{ fontSize: 11, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                checked={backup.pointInTimeRecovery}
                onChange={(e) =>
                  onChange({
                    backup: {
                      ...backup,
                      pointInTimeRecovery: e.target.checked,
                    },
                  })
                }
              />
              Point-in-time Recovery
            </label>
            <label style={{ fontSize: 11, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                checked={backup.multiRegion.enabled}
                onChange={(e) =>
                  onChange({
                    backup: {
                      ...backup,
                      multiRegion: {
                        ...backup.multiRegion,
                        enabled: e.target.checked,
                      },
                    },
                  })
                }
              />
              Multi-region DR
            </label>
          </div>

          {backup.multiRegion.enabled && (
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  type="text"
                  value={backupRegionDraft}
                  onChange={(e) => setBackupRegionDraft(e.target.value)}
                  placeholder="Add region (e.g. us-west-2)"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const region = backupRegionDraft.trim();
                    if (!region) return;
                    if (backup.multiRegion.regions.includes(region)) {
                      setBackupRegionDraft("");
                      return;
                    }
                    onChange({
                      backup: {
                        ...backup,
                        multiRegion: {
                          ...backup.multiRegion,
                          regions: [...backup.multiRegion.regions, region],
                        },
                      },
                    });
                    setBackupRegionDraft("");
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

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(backup.multiRegion.regions || []).map((region) => (
                  <button
                    key={region}
                    type="button"
                    onClick={() =>
                      onChange({
                        backup: {
                          ...backup,
                          multiRegion: {
                            ...backup.multiRegion,
                            regions: backup.multiRegion.regions.filter((value) => value !== region),
                          },
                        },
                      })
                    }
                    style={{
                      border: "1px solid var(--border)",
                      background: "var(--panel)",
                      color: "var(--secondary)",
                      borderRadius: 999,
                      padding: "2px 8px",
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    {region} x
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

