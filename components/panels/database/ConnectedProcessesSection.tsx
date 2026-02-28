"use client";

import React from "react";
import { DBConnectionSummary } from "@/lib/schema/graph";

type ConnectedProcessesSectionProps = {
  summary: DBConnectionSummary | null;
  labelStyle: React.CSSProperties;
  sectionStyle: React.CSSProperties;
};

export function ConnectedProcessesSection({
  summary,
  labelStyle,
  sectionStyle,
}: ConnectedProcessesSectionProps) {
  return (
    <div style={sectionStyle}>
      <div style={labelStyle}>Connected Processes</div>
      {!summary ? (
        <div style={{ fontSize: 11, color: "var(--muted)" }}>
          No connection data.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>
            {summary.operationCount} operations across {summary.connectionCount} nodes
          </div>

          <div style={{ display: "grid", gap: 4 }}>
            <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase" }}>
              Reads
            </div>
            {summary.readers
              .filter((entry) => entry.nodeType === "process")
              .map((entry) => (
                <div
                  key={`read-${entry.nodeId}`}
                  style={{
                    fontSize: 11,
                    color: "var(--secondary)",
                    display: "flex",
                    justifyContent: "space-between",
                    border: "1px solid var(--border)",
                    borderRadius: 4,
                    padding: "4px 6px",
                    background: "var(--panel)",
                  }}
                >
                  <span>{entry.nodeName}</span>
                  <span style={{ color: "var(--muted)" }}>read</span>
                </div>
              ))}
            {summary.readers.filter((entry) => entry.nodeType === "process").length === 0 && (
              <div style={{ fontSize: 11, color: "var(--muted)" }}>
                No process readers
              </div>
            )}
          </div>

          <div style={{ display: "grid", gap: 4 }}>
            <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase" }}>
              Writes
            </div>
            {summary.writers
              .filter((entry) => entry.nodeType === "process")
              .map((entry) => (
                <div
                  key={`write-${entry.nodeId}`}
                  style={{
                    fontSize: 11,
                    color: "var(--secondary)",
                    display: "flex",
                    justifyContent: "space-between",
                    border: "1px solid var(--border)",
                    borderRadius: 4,
                    padding: "4px 6px",
                    background: "var(--panel)",
                  }}
                >
                  <span>{entry.nodeName}</span>
                  <span style={{ color: "var(--muted)" }}>write</span>
                </div>
              ))}
            {summary.writers.filter((entry) => entry.nodeType === "process").length === 0 && (
              <div style={{ fontSize: 11, color: "var(--muted)" }}>
                No process writers
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

