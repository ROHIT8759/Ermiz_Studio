"use client";

import React, { useMemo, useState } from "react";
import {
  DatabaseBlock,
  DatabaseSchemaChangeType,
} from "@/lib/schema/node";

type ChangeHistorySectionProps = {
  database: DatabaseBlock;
  sectionStyle: React.CSSProperties;
  selectStyle: React.CSSProperties;
};

const changeTypeOptions: DatabaseSchemaChangeType[] = [
  "table_added",
  "field_added",
  "field_modified",
  "field_removed",
  "table_removed",
];

const changeTypeLabel: Record<DatabaseSchemaChangeType, string> = {
  table_added: "Table added",
  field_added: "Field added",
  field_modified: "Field modified",
  field_removed: "Field removed",
  table_removed: "Table removed",
};

const formatTimestamp = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

export function ChangeHistorySection({
  database,
  sectionStyle,
  selectStyle,
}: ChangeHistorySectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [filter, setFilter] = useState<"all" | DatabaseSchemaChangeType>("all");
  const [openDiffIds, setOpenDiffIds] = useState<Record<string, boolean>>({});

  const history = useMemo(() => database.schemaHistory || [], [database.schemaHistory]);
  const filteredHistory = useMemo(() => {
    const entries = filter === "all" ? history : history.filter((entry) => entry.changeType === filter);
    return [...entries].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [filter, history]);

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
        <span>Change History</span>
        <span
          style={{
            border: "1px solid var(--border)",
            borderRadius: 999,
            padding: "0 6px",
            fontSize: 10,
            textTransform: "none",
            color: "var(--secondary)",
          }}
        >
          {history.length}
        </span>
      </button>

      {isExpanded && (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6, alignItems: "center" }}>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>Timeline</div>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as "all" | DatabaseSchemaChangeType)}
              style={{ ...selectStyle, fontSize: 11, padding: "4px 8px", minWidth: 150 }}
            >
              <option value="all">All changes</option>
              {changeTypeOptions.map((type) => (
                <option key={type} value={type}>
                  {changeTypeLabel[type]}
                </option>
              ))}
            </select>
          </div>

          {filteredHistory.length === 0 && (
            <div style={{ fontSize: 11, color: "var(--muted)" }}>
              No schema changes found for this filter.
            </div>
          )}

          {filteredHistory.length > 0 && (
            <div style={{ display: "grid", gap: 6, maxHeight: 260, overflowY: "auto", paddingRight: 2 }}>
              {filteredHistory.map((entry, index) => {
                const rowId = `${entry.timestamp}-${entry.changeType}-${entry.target}-${index}`;
                const before = entry.details?.before;
                const after = entry.details?.after;
                const hasDiff = typeof before !== "undefined" || typeof after !== "undefined";
                const isDiffOpen = Boolean(openDiffIds[rowId]);

                return (
                  <div
                    key={rowId}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      background: "var(--floating)",
                      padding: "6px 8px",
                      display: "grid",
                      gap: 4,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: "var(--foreground)" }}>
                        {changeTypeLabel[entry.changeType]} <span style={{ color: "var(--secondary)" }}>{entry.target}</span>
                      </span>
                      <span style={{ fontSize: 10, color: "var(--muted)" }}>{formatTimestamp(entry.timestamp)}</span>
                    </div>

                    {hasDiff && (
                      <button
                        type="button"
                        onClick={() =>
                          setOpenDiffIds((prev) => ({
                            ...prev,
                            [rowId]: !prev[rowId],
                          }))
                        }
                        style={{
                          border: "1px solid var(--border)",
                          background: "var(--panel)",
                          color: "var(--muted)",
                          borderRadius: 4,
                          padding: "2px 6px",
                          fontSize: 10,
                          cursor: "pointer",
                          justifySelf: "start",
                        }}
                      >
                        {isDiffOpen ? "Hide diff" : "View diff"}
                      </button>
                    )}

                    {hasDiff && isDiffOpen && (
                      <div style={{ display: "grid", gap: 6 }}>
                        <div
                          style={{
                            border: "1px solid var(--border)",
                            borderRadius: 4,
                            background: "var(--panel)",
                            padding: 6,
                          }}
                        >
                          <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4 }}>Before</div>
                          <pre
                            style={{
                              margin: 0,
                              fontSize: 10,
                              color: "var(--foreground)",
                              fontFamily:
                                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace",
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                            }}
                          >
                            {typeof before === "undefined" ? "n/a" : JSON.stringify(before, null, 2)}
                          </pre>
                        </div>
                        <div
                          style={{
                            border: "1px solid var(--border)",
                            borderRadius: 4,
                            background: "var(--panel)",
                            padding: 6,
                          }}
                        >
                          <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4 }}>After</div>
                          <pre
                            style={{
                              margin: 0,
                              fontSize: 10,
                              color: "var(--foreground)",
                              fontFamily:
                                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace",
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                            }}
                          >
                            {typeof after === "undefined" ? "n/a" : JSON.stringify(after, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
