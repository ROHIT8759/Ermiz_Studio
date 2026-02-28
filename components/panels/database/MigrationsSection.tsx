"use client";

import React, { useState } from "react";
import { DatabaseBlock, DatabaseMigration } from "@/lib/schema/node";

type MigrationsSectionProps = {
  database: DatabaseBlock;
  onChange: (updates: Partial<DatabaseBlock>) => void;
  inputStyle: React.CSSProperties;
  sectionStyle: React.CSSProperties;
};

export function MigrationsSection({
  database,
  onChange,
  inputStyle,
  sectionStyle,
}: MigrationsSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [expandedMigrations, setExpandedMigrations] = useState<Record<number, boolean>>({});

  const migrations = database.migrations || [];

  const updateMigrations = (next: DatabaseMigration[]) => {
    onChange({ migrations: next });
  };

  const exportMigrationsAsFiles = () => {
    if (typeof window === "undefined") return;
    if (migrations.length === 0) return;

    migrations.forEach((migration) => {
      const version = migration.version || "v_unknown";
      const upFile = new Blob([migration.upScript || "-- up script"], {
        type: "text/sql;charset=utf-8",
      });
      const downFile = new Blob([migration.downScript || "-- down script"], {
        type: "text/sql;charset=utf-8",
      });
      const upUrl = URL.createObjectURL(upFile);
      const downUrl = URL.createObjectURL(downFile);

      const upAnchor = document.createElement("a");
      upAnchor.href = upUrl;
      upAnchor.download = `${version}__up.sql`;
      upAnchor.click();
      URL.revokeObjectURL(upUrl);

      const downAnchor = document.createElement("a");
      downAnchor.href = downUrl;
      downAnchor.download = `${version}__down.sql`;
      downAnchor.click();
      URL.revokeObjectURL(downUrl);
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
        <span>Schema Migrations</span>
      </button>

      {isExpanded && (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              onClick={() => {
                const nextVersion = `v${migrations.length + 1}`;
                const next = [
                  ...migrations,
                  {
                    version: nextVersion,
                    timestamp: "",
                    description: "",
                    upScript: "",
                    downScript: "",
                    applied: false,
                  },
                ];
                updateMigrations(next);
                setExpandedMigrations((prev) => ({ ...prev, [next.length - 1]: true }));
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
              + Migration
            </button>
            <button
              type="button"
              onClick={exportMigrationsAsFiles}
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
              Export Migrations
            </button>
          </div>

          {migrations.length === 0 && (
            <div style={{ fontSize: 11, color: "var(--muted)" }}>
              No migrations yet.
            </div>
          )}

          {migrations.map((migration, migrationIndex) => {
            const open = expandedMigrations[migrationIndex] ?? false;
            return (
              <div
                key={`${migration.version}-${migrationIndex}`}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  background: "var(--floating)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: 8,
                  }}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedMigrations((prev) => ({
                        ...prev,
                        [migrationIndex]: !open,
                      }))
                    }
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "var(--muted)",
                      cursor: "pointer",
                      fontSize: 11,
                      padding: 0,
                      width: 14,
                    }}
                  >
                    {open ? "▾" : "▸"}
                  </button>
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--foreground)",
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    }}
                  >
                    {migration.version}
                  </span>
                  <label
                    style={{
                      marginLeft: "auto",
                      fontSize: 11,
                      color: "var(--muted)",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={migration.applied}
                      onChange={(e) => {
                        const next = [...migrations];
                        next[migrationIndex] = { ...next[migrationIndex], applied: e.target.checked };
                        updateMigrations(next);
                      }}
                    />
                    Applied
                  </label>
                  <button
                    type="button"
                    onClick={() => updateMigrations(migrations.filter((_, i) => i !== migrationIndex))}
                    style={{
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

                {open && (
                  <div
                    style={{
                      borderTop: "1px solid var(--border)",
                      padding: 8,
                      display: "grid",
                      gap: 6,
                    }}
                  >
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                      <input
                        value={migration.version}
                        onChange={(e) => {
                          const next = [...migrations];
                          next[migrationIndex] = { ...next[migrationIndex], version: e.target.value };
                          updateMigrations(next);
                        }}
                        placeholder="Version"
                        style={inputStyle}
                      />
                      <input
                        value={migration.timestamp}
                        onChange={(e) => {
                          const next = [...migrations];
                          next[migrationIndex] = { ...next[migrationIndex], timestamp: e.target.value };
                          updateMigrations(next);
                        }}
                        placeholder="Timestamp"
                        style={inputStyle}
                      />
                    </div>
                    <input
                      value={migration.description}
                      onChange={(e) => {
                        const next = [...migrations];
                        next[migrationIndex] = { ...next[migrationIndex], description: e.target.value };
                        updateMigrations(next);
                      }}
                      placeholder="Description"
                      style={inputStyle}
                    />
                    <textarea
                      value={migration.upScript}
                      onChange={(e) => {
                        const next = [...migrations];
                        next[migrationIndex] = { ...next[migrationIndex], upScript: e.target.value };
                        updateMigrations(next);
                      }}
                      placeholder="Up script"
                      style={{
                        ...inputStyle,
                        minHeight: 70,
                        resize: "vertical",
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                      }}
                    />
                    <textarea
                      value={migration.downScript}
                      onChange={(e) => {
                        const next = [...migrations];
                        next[migrationIndex] = { ...next[migrationIndex], downScript: e.target.value };
                        updateMigrations(next);
                      }}
                      placeholder="Down script"
                      style={{
                        ...inputStyle,
                        minHeight: 70,
                        resize: "vertical",
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

