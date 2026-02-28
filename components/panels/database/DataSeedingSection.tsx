"use client";

import React, { useState } from "react";
import { DatabaseBlock, DatabaseSeed, DatabaseTableField } from "@/lib/schema/node";

type DataSeedingSectionProps = {
  database: DatabaseBlock;
  onChange: (updates: Partial<DatabaseBlock>) => void;
  inputStyle: React.CSSProperties;
  selectStyle: React.CSSProperties;
  sectionStyle: React.CSSProperties;
  onMessage?: (message: string, type: "success" | "error") => void;
};

const mockValueForField = (field: DatabaseTableField, index: number) => {
  const safeName = (field.name || "field").toLowerCase();
  if (field.type === "number") return index + 1;
  if (field.type === "int" || field.type === "bigint") return index + 1;
  if (field.type === "float" || field.type === "decimal") return Number(`${index + 1}.5`);
  if (field.type === "boolean") return index % 2 === 0;
  if (field.type === "date" || field.type === "datetime") {
    return `2026-01-${String((index % 28) + 1).padStart(2, "0")}T00:00:00Z`;
  }
  if (field.type === "json") return { sample: safeName, index };
  if (field.type === "uuid") return `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
  return `${safeName}_${index + 1}`;
};

export function DataSeedingSection({
  database,
  onChange,
  inputStyle,
  selectStyle,
  sectionStyle,
  onMessage,
}: DataSeedingSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [expandedSeeds, setExpandedSeeds] = useState<Record<number, boolean>>({});
  const [fixtureDrafts, setFixtureDrafts] = useState<Record<number, string>>({});

  const seeds = database.seeds || [];
  const tables = database.tables || [];

  const updateSeeds = (nextSeeds: DatabaseSeed[]) => {
    onChange({ seeds: nextSeeds });
  };

  const buildRandomSeedPreview = (seed: DatabaseSeed) => {
    const table = tables.find((candidate) => candidate.name === seed.tableName);
    if (!table) return [];
    const sampleCount = Math.min(Math.max(seed.rowCount || 1, 1), 3);
    return Array.from({ length: sampleCount }).map((_, rowIndex) => {
      const row: Record<string, unknown> = {};
      (table.fields || []).forEach((field) => {
        row[field.name] = mockValueForField(field, rowIndex);
      });
      return row;
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
        <span>Data Seeding</span>
      </button>

      {isExpanded && (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>
              {seeds.length} seeds configured
            </span>
            <button
              type="button"
              onClick={() => {
                const defaultTable = tables[0]?.name || "";
                if (!defaultTable) {
                  onMessage?.("Create a table first to configure seeds.", "error");
                  return;
                }
                updateSeeds([
                  ...seeds,
                  {
                    tableName: defaultTable,
                    rowCount: 10,
                    strategy: "random",
                    fixtureData: [],
                    customScript: "",
                  },
                ]);
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
              + Seed
            </button>
          </div>

          {seeds.length === 0 && (
            <div style={{ fontSize: 11, color: "var(--muted)" }}>
              No seed configs yet.
            </div>
          )}

          {seeds.map((seed, seedIndex) => {
            const expanded = expandedSeeds[seedIndex] ?? true;
            const previewRows = seed.strategy === "random" ? buildRandomSeedPreview(seed) : [];
            const fixtureText =
              fixtureDrafts[seedIndex] ?? JSON.stringify(seed.fixtureData || [], null, 2);
            return (
              <div
                key={`${seed.tableName}-${seedIndex}`}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  background: "var(--floating)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: 8 }}>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedSeeds((prev) => ({ ...prev, [seedIndex]: !expanded }))
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
                    {expanded ? "▾" : "▸"}
                  </button>
                  <span style={{ fontSize: 11, color: "var(--foreground)", flex: 1 }}>
                    {seed.tableName || "Select table"} · {seed.strategy}
                  </span>
                  <span style={{ fontSize: 10, color: "var(--muted)" }}>
                    {seed.rowCount} rows
                  </span>
                  <button
                    type="button"
                    onClick={() => updateSeeds(seeds.filter((_, index) => index !== seedIndex))}
                    style={{
                      border: "1px solid var(--border)",
                      background: "transparent",
                      color: "var(--muted)",
                      borderRadius: 4,
                      padding: "3px 6px",
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    x
                  </button>
                </div>

                {expanded && (
                  <div style={{ padding: 8, borderTop: "1px solid var(--border)", display: "grid", gap: 6 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 0.8fr 0.8fr", gap: 6 }}>
                      <select
                        value={seed.tableName}
                        onChange={(e) => {
                          const nextSeeds = [...seeds];
                          nextSeeds[seedIndex] = { ...seed, tableName: e.target.value };
                          updateSeeds(nextSeeds);
                        }}
                        style={selectStyle}
                      >
                        {tables.map((table, index) => (
                          <option key={`${table.name}-${index}`} value={table.name}>
                            {table.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={1}
                        value={seed.rowCount}
                        onChange={(e) => {
                          const nextSeeds = [...seeds];
                          nextSeeds[seedIndex] = {
                            ...seed,
                            rowCount: Math.max(1, Number(e.target.value) || 1),
                          };
                          updateSeeds(nextSeeds);
                        }}
                        placeholder="Rows"
                        style={inputStyle}
                      />
                      <select
                        value={seed.strategy}
                        onChange={(e) => {
                          const nextSeeds = [...seeds];
                          nextSeeds[seedIndex] = {
                            ...seed,
                            strategy: e.target.value as DatabaseSeed["strategy"],
                          };
                          updateSeeds(nextSeeds);
                        }}
                        style={selectStyle}
                      >
                        <option value="random">random</option>
                        <option value="fixture">fixture</option>
                        <option value="custom">custom</option>
                      </select>
                    </div>

                    {seed.strategy === "random" && (
                      <div style={{ display: "grid", gap: 4 }}>
                        <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase" }}>
                          Example Rows
                        </div>
                        <pre
                          style={{
                            margin: 0,
                            border: "1px solid var(--border)",
                            borderRadius: 4,
                            background: "var(--panel)",
                            color: "var(--secondary)",
                            padding: 8,
                            fontSize: 10,
                            maxHeight: 120,
                            overflow: "auto",
                            fontFamily:
                              "ui-monospace, SFMono-Regular, Menlo, monospace",
                          }}
                        >
                          {JSON.stringify(previewRows, null, 2)}
                        </pre>
                      </div>
                    )}

                    {seed.strategy === "fixture" && (
                      <div style={{ display: "grid", gap: 4 }}>
                        <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase" }}>
                          Fixture JSON Array
                        </div>
                        <textarea
                          value={fixtureText}
                          onChange={(e) =>
                            setFixtureDrafts((prev) => ({
                              ...prev,
                              [seedIndex]: e.target.value,
                            }))
                          }
                          onBlur={() => {
                            try {
                              const parsed = JSON.parse(fixtureText);
                              if (!Array.isArray(parsed)) {
                                onMessage?.("Fixture data must be a JSON array.", "error");
                                return;
                              }
                              const nextSeeds = [...seeds];
                              nextSeeds[seedIndex] = {
                                ...seed,
                                fixtureData: parsed as Array<Record<string, unknown>>,
                              };
                              updateSeeds(nextSeeds);
                              setFixtureDrafts((prev) => {
                                const next = { ...prev };
                                delete next[seedIndex];
                                return next;
                              });
                            } catch {
                              onMessage?.("Invalid fixture JSON.", "error");
                            }
                          }}
                          placeholder='[{"id":1,"name":"example"}]'
                          style={{
                            ...inputStyle,
                            minHeight: 90,
                            resize: "vertical",
                            fontFamily:
                              "ui-monospace, SFMono-Regular, Menlo, monospace",
                          }}
                        />
                      </div>
                    )}

                    {seed.strategy === "custom" && (
                      <div style={{ display: "grid", gap: 4 }}>
                        <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase" }}>
                          Custom Seed Script
                        </div>
                        <textarea
                          value={seed.customScript || ""}
                          onChange={(e) => {
                            const nextSeeds = [...seeds];
                            nextSeeds[seedIndex] = {
                              ...seed,
                              customScript: e.target.value,
                            };
                            updateSeeds(nextSeeds);
                          }}
                          placeholder="return [{...}]"
                          style={{
                            ...inputStyle,
                            minHeight: 90,
                            resize: "vertical",
                            fontFamily:
                              "ui-monospace, SFMono-Regular, Menlo, monospace",
                          }}
                        />
                      </div>
                    )}
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

