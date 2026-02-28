"use client";

import React, { useState, useCallback, useEffect, useMemo } from "react";
import { useStore } from "@/store/useStore";
import type {
  ApiBinding,
  ProcessDefinition,
  DatabaseBlock,
  QueueBlock,
  InfraBlock,
  InputField,
  OutputField,
} from "@/lib/schema/node";
import type { Node } from "@xyflow/react";
import type { NodeData } from "@/lib/schema/node";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockStr(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("id") && !n.includes("valid") && !n.includes("liquid"))
    return "00000000-0000-0000-0000-000000000001";
  if (n.includes("email")) return "user@example.com";
  if (n.includes("password") || n.includes("secret")) return "SuperSecret123!";
  if (n.includes("token") || n.includes("api_key") || n.includes("apikey"))
    return "tk_live_abc123def456";
  if (n.includes("first")) return "John";
  if (n.includes("last")) return "Doe";
  if (n.includes("name") && !n.includes("file") && !n.includes("bucket"))
    return "John Doe";
  if (n.includes("phone")) return "+1-555-0100";
  if (n.includes("url") || n.includes("link") || n.includes("href") || n.includes("uri"))
    return "https://example.com/path";
  if (n.includes("_at") || n.includes("date") || n.includes("time"))
    return new Date().toISOString();
  if (n.includes("status")) return "active";
  if (n.includes("role") || n.includes("type")) return "user";
  if (n.includes("message") || n.includes("body") || n.includes("content") || n.includes("text"))
    return "Hello, world!";
  if (n.includes("title") || n.includes("subject")) return "Sample Title";
  if (n.includes("description") || n.includes("summary") || n.includes("bio"))
    return "A brief description.";
  if (n.includes("code")) return "CODE001";
  if (n.includes("ip")) return "192.168.1.1";
  if (n.includes("host") || n.includes("domain")) return "example.com";
  if (n.includes("port")) return "8080";
  if (n.includes("path")) return "/api/v1/resource";
  if (n.includes("tag") || n.includes("label") || n.includes("category")) return "general";
  if (n.includes("version")) return "1.0.0";
  if (n.includes("currency")) return "USD";
  if (n.includes("country")) return "US";
  if (n.includes("city")) return "San Francisco";
  if (n.includes("address")) return "123 Main St";
  return "sample-value";
}

function mockForField(name: string, type: string): string {
  if (type === "boolean") return "true";
  if (type === "number") {
    const n = name.toLowerCase();
    if (n.includes("age")) return "28";
    if (n.includes("limit") || n.includes("count")) return "10";
    if (n.includes("price") || n.includes("amount") || n.includes("cost")) return "29.99";
    if (n.includes("port")) return "8080";
    return "42";
  }
  if (type === "object" || type === "array") return "";
  return mockStr(name);
}

function buildMockObject(schema: OutputField[]): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const f of schema) {
    if (f.type === "number") obj[f.name] = parseFloat(mockForField(f.name, "number")) || 0;
    else if (f.type === "boolean") obj[f.name] = true;
    else if (f.type === "array") obj[f.name] = [];
    else if (f.type === "object") {
      const nested: Record<string, unknown> = {};
      if (f.properties?.length) {
        for (const p of f.properties) nested[p.name] = mockStr(p.name);
      }
      obj[f.name] = nested;
    } else {
      obj[f.name] = mockStr(f.name);
    }
  }
  return obj;
}

function buildMockRow(fields: { name: string; type: string }[]): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const f of fields) {
    const t = f.type;
    if (t === "boolean") row[f.name] = true;
    else if (t === "int" || t === "bigint") row[f.name] = Math.floor(Math.random() * 1000) + 1;
    else if (t === "float" || t === "decimal") row[f.name] = +(Math.random() * 100).toFixed(2);
    else if (t === "uuid") row[f.name] = mockStr("id");
    else if (t === "json") row[f.name] = {};
    else if (t === "date") row[f.name] = new Date().toISOString().split("T")[0];
    else if (t === "datetime") row[f.name] = new Date().toISOString();
    else row[f.name] = mockStr(f.name);
  }
  return row;
}

function randMs(lo = 80, hi = 500) {
  return Math.floor(Math.random() * (hi - lo) + lo);
}
function wait(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
function initValues(fields: InputField[]) {
  return Object.fromEntries(fields.map((f) => [f.name, mockForField(f.name, f.type)]));
}

// ─── Style tokens ─────────────────────────────────────────────────────────────

const C = {
  bg: "#0f131a",
  panel: "#151b24",
  float: "#1a2230",
  border: "#1e2836",
  fg: "#eef2f8",
  muted: "#6b7a99",
  primary: "#87a3ff",
  green: "#22c55e",
  amber: "#f59e0b",
  red: "#ef4444",
};

const METHOD_COLOR: Record<string, string> = {
  GET: "#22c55e",
  POST: "#87a3ff",
  PUT: "#f59e0b",
  PATCH: "#f59e0b",
  DELETE: "#ef4444",
};

// ─── Small atoms ─────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <>
      <style>{`@keyframes _spin{to{transform:rotate(360deg)}}`}</style>
      <span
        style={{
          display: "inline-block",
          width: 13,
          height: 13,
          border: `2px solid ${C.border}`,
          borderTopColor: C.primary,
          borderRadius: "50%",
          animation: "_spin .7s linear infinite",
          flexShrink: 0,
        }}
      />
    </>
  );
}

function Badge({
  label,
  color = C.primary,
}: {
  label: string;
  color?: string;
}) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.05em",
        padding: "2px 7px",
        borderRadius: 5,
        background: `color-mix(in srgb, ${color} 18%, ${C.panel})`,
        color,
        border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}

function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: C.panel,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: 14,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 6 }}>
      {children}
    </div>
  );
}

function CodeBlock({ value }: { value: unknown }) {
  return (
    <pre
      style={{
        fontFamily: "Menlo, Consolas, 'Courier New', monospace",
        fontSize: 11,
        background: C.bg,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        padding: "10px 12px",
        color: C.fg,
        whiteSpace: "pre",
        overflowX: "auto",
        overflowY: "auto",
        maxHeight: 260,
        lineHeight: 1.6,
        margin: 0,
      }}
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  background: C.bg,
  border: `1px solid ${C.border}`,
  color: C.fg,
  borderRadius: 7,
  padding: "6px 10px",
  fontSize: 12,
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
};

const BTN_STYLE = (primary = false): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  border: `1px solid ${primary ? C.primary : C.border}`,
  background: primary ? `color-mix(in srgb, ${C.primary} 18%, ${C.panel})` : C.float,
  color: C.fg,
  borderRadius: 8,
  padding: "7px 16px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  flexShrink: 0,
});

type RunResult = { status: number; latency: number; body: unknown };

function ResultPanel({ result }: { result: RunResult }) {
  const ok = result.status < 400;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Badge label={String(result.status)} color={ok ? C.green : C.red} />
        <span style={{ fontSize: 11, color: C.muted }}>{result.latency}ms</span>
        <span style={{ fontSize: 11, color: ok ? C.green : C.red }}>
          {ok ? "OK" : "Error"}
        </span>
      </div>
      <CodeBlock value={result.body} />
    </div>
  );
}

// Input group for a list of InputFields
function FieldGroup({
  label,
  fields,
  values,
  onChange,
}: {
  label: string;
  fields: InputField[];
  values: Record<string, string>;
  onChange: (name: string, v: string) => void;
}) {
  if (!fields.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <SectionLabel>{label}</SectionLabel>
      {fields.map((f) => (
        <div key={f.name}>
          <label
            style={{
              fontSize: 11,
              color: C.muted,
              display: "flex",
              alignItems: "center",
              gap: 4,
              marginBottom: 4,
            }}
          >
            <span style={{ color: C.fg, fontWeight: 500 }}>{f.name}</span>
            {f.required && <span style={{ color: C.red }}>*</span>}
            {f.type !== "string" && (
              <span style={{ color: C.muted }}>({f.type})</span>
            )}
          </label>
          {f.type === "boolean" ? (
            <select
              style={INPUT_STYLE}
              value={values[f.name] ?? "true"}
              onChange={(e) => onChange(f.name, e.target.value)}
            >
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          ) : f.type === "object" || f.type === "array" ? (
            <textarea
              style={{ ...INPUT_STYLE, minHeight: 60, resize: "vertical", fontFamily: "monospace" }}
              value={values[f.name] ?? ""}
              onChange={(e) => onChange(f.name, e.target.value)}
              placeholder={f.type === "object" ? "{}" : "[]"}
              spellCheck={false}
            />
          ) : (
            <input
              style={INPUT_STYLE}
              value={values[f.name] ?? ""}
              onChange={(e) => onChange(f.name, e.target.value)}
              placeholder={mockForField(f.name, f.type)}
              type={f.type === "number" ? "number" : "text"}
            />
          )}
          {f.description && (
            <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>{f.description}</div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── API Pane ─────────────────────────────────────────────────────────────────

function ApiPane({ node }: { node: ApiBinding }) {
  const isRest = node.protocol === "rest";
  const bodyFields = node.request?.body?.schema ?? [];
  const pathParams = node.request?.pathParams ?? [];
  const queryParams = node.request?.queryParams ?? [];
  const headerFields = node.request?.headers ?? [];

  const [pv, setPv] = useState(() => initValues(pathParams));
  const [qv, setQv] = useState(() => initValues(queryParams));
  const [hv, setHv] = useState(() => initValues(headerFields));
  const [bv, setBv] = useState(() => initValues(bodyFields));
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);

  const set =
    (s: React.Dispatch<React.SetStateAction<Record<string, string>>>) =>
    (name: string, v: string) =>
      s((p) => ({ ...p, [name]: v }));

  const send = useCallback(async () => {
    setRunning(true);
    setResult(null);
    const ms = randMs(120, 550);
    await wait(ms);
    const successSchema = node.responses?.success?.schema ?? [];
    const body = successSchema.length
      ? buildMockObject(successSchema)
      : { success: true, message: "Request processed successfully." };
    setResult({ status: node.responses?.success?.statusCode ?? 200, latency: ms, body });
    setRunning(false);
  }, [node]);

  if (!isRest) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <NodeTitle label={node.label} desc={node.description}>
          <Badge label={node.protocol.toUpperCase()} />
        </NodeTitle>
        <Panel>
          <SectionLabel>Protocol Configuration</SectionLabel>
          {node.instance ? (
            <CodeBlock value={(node.instance as { config: unknown }).config} />
          ) : (
            <div style={{ fontSize: 12, color: C.muted }}>No instance config defined.</div>
          )}
        </Panel>
        <div style={{ fontSize: 12, color: C.muted }}>
          Live connection testing for <strong style={{ color: C.fg }}>{node.protocol}</strong> requires
          a running server. The config above reflects what will be generated.
        </div>
      </div>
    );
  }

  const methodColor = METHOD_COLOR[node.method ?? "GET"] ?? C.primary;
  const hasInputs = pathParams.length || queryParams.length || headerFields.length || bodyFields.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Title */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
          <Badge label={node.method ?? "GET"} color={methodColor} />
          <code style={{ fontSize: 14, fontWeight: 700, color: C.fg }}>{node.route}</code>
          {node.deprecated && <Badge label="DEPRECATED" color={C.amber} />}
          <span style={{ fontSize: 11, color: C.muted }}>v{node.version}</span>
        </div>
        <div style={{ fontSize: 12, color: C.muted }}>{node.description || node.label}</div>
        {node.security && node.security.type !== "none" && (
          <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
            Auth: <strong style={{ color: C.fg }}>{node.security.type}</strong>
            {node.security.headerName && ` · ${node.security.headerName}`}
          </div>
        )}
      </div>

      {/* Inputs */}
      {hasInputs ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <FieldGroup label="Path Parameters" fields={pathParams} values={pv} onChange={set(setPv)} />
          <FieldGroup label="Query Parameters" fields={queryParams} values={qv} onChange={set(setQv)} />
          <FieldGroup label="Headers" fields={headerFields} values={hv} onChange={set(setHv)} />
          <FieldGroup
            label={`Body · ${node.request?.body?.contentType ?? "application/json"}`}
            fields={bodyFields}
            values={bv}
            onChange={set(setBv)}
          />
        </div>
      ) : (
        <div style={{ fontSize: 12, color: C.muted }}>No inputs defined for this endpoint.</div>
      )}

      <button style={BTN_STYLE(true)} onClick={send} disabled={running}>
        {running ? <><Spinner /> Sending…</> : `▶  Send ${node.method ?? "GET"} Request`}
      </button>

      {result && <ResultPanel result={result} />}
    </div>
  );
}

// ─── Function Pane ────────────────────────────────────────────────────────────

function FunctionPane({ node }: { node: ProcessDefinition }) {
  const [values, setValues] = useState<Record<string, string>>(() => ({
    ...initValues(node.inputs),
    ...(node.testInputs ?? {}),
  }));
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<{ ms: number; text: string }[]>([]);
  const [result, setResult] = useState<RunResult | null>(null);

  const run = useCallback(async () => {
    setRunning(true);
    setLog([]);
    setResult(null);
    const steps =
      node.steps.length > 0
        ? node.steps
        : [
            { id: "1", kind: "compute" as const, description: "Validate inputs" },
            { id: "2", kind: "compute" as const, description: "Execute business logic" },
            { id: "3", kind: "return" as const, description: "Return result" },
          ];

    const t0 = Date.now();
    for (const step of steps) {
      await wait(randMs(30, 180));
      setLog((prev) => [
        ...prev,
        { ms: Date.now() - t0, text: `${step.kind}: ${step.description || step.kind}` },
      ]);
    }
    const latency = Date.now() - t0;
    const successOutputs = node.outputs?.success ?? [];
    const body = successOutputs.length
      ? buildMockObject(successOutputs)
      : { success: true };
    setResult({ status: 200, latency, body });
    setRunning(false);
  }, [node]);

  const EXEC_LABEL: Record<string, string> = {
    sync: "Sync",
    async: "Async",
    scheduled: "Scheduled",
    event_driven: "Event-driven",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <NodeTitle label={node.label} desc={node.description}>
        <Badge label={node.processType === "start_function" ? "Start" : "Function"} />
        <Badge label={EXEC_LABEL[node.execution] ?? node.execution} color={C.muted} />
      </NodeTitle>

      {(node.timeout || node.memoryMb || node.concurrency) && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {node.timeout && <Badge label={`${node.timeout}s timeout`} color={C.muted} />}
          {node.memoryMb && <Badge label={`${node.memoryMb}MB`} color={C.muted} />}
          {node.concurrency && <Badge label={`×${node.concurrency} concurrency`} color={C.muted} />}
        </div>
      )}

      {node.inputs.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <SectionLabel>Inputs</SectionLabel>
          {node.inputs.map((f) => (
            <div key={f.name}>
              <label
                style={{ fontSize: 11, color: C.muted, display: "flex", gap: 4, marginBottom: 4 }}
              >
                <span style={{ color: C.fg, fontWeight: 500 }}>{f.name}</span>
                {f.required && <span style={{ color: C.red }}>*</span>}
                <span>({f.type})</span>
              </label>
              <input
                style={INPUT_STYLE}
                value={values[f.name] ?? ""}
                onChange={(e) => setValues((p) => ({ ...p, [f.name]: e.target.value }))}
                placeholder={mockForField(f.name, f.type)}
              />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: C.muted }}>This function takes no inputs.</div>
      )}

      <button style={BTN_STYLE(true)} onClick={run} disabled={running}>
        {running ? <><Spinner /> Running…</> : "▶  Run Function"}
      </button>

      {(log.length > 0 || running) && (
        <Panel>
          <SectionLabel>Execution Log</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {log.map((e, i) => (
              <div
                key={i}
                style={{ display: "flex", gap: 10, fontSize: 11, fontFamily: "monospace" }}
              >
                <span style={{ color: C.muted, minWidth: 50 }}>[{e.ms}ms]</span>
                <span style={{ color: C.green }}>✓</span>
                <span style={{ color: C.fg }}>{e.text}</span>
              </div>
            ))}
            {running && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 11 }}>
                <Spinner />
                <span style={{ color: C.muted }}>Executing…</span>
              </div>
            )}
          </div>
        </Panel>
      )}

      {result && (
        <div>
          <SectionLabel>Output</SectionLabel>
          <ResultPanel result={result} />
        </div>
      )}

      {node.notes && (
        <Panel>
          <SectionLabel>Notes</SectionLabel>
          <div style={{ fontSize: 12, color: C.muted }}>{node.notes}</div>
        </Panel>
      )}
    </div>
  );
}

// ─── Database Pane ────────────────────────────────────────────────────────────

function DatabasePane({ node }: { node: DatabaseBlock }) {
  const [selectedTable, setSelectedTable] = useState(node.tables[0]?.name ?? "");
  const [query, setQuery] = useState("");
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [queryTime, setQueryTime] = useState<number | null>(null);

  const currentTable = node.tables.find((t) => t.name === selectedTable);

  useEffect(() => {
    if (currentTable) {
      setQuery(`SELECT *\nFROM ${currentTable.name}\nLIMIT 10;`);
      setRows(null);
    }
  }, [currentTable?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const runQuery = useCallback(async () => {
    if (!currentTable) return;
    setRunning(true);
    setRows(null);
    const ms = randMs(40, 200);
    await wait(ms);
    const count = Math.max(1, Math.min(node.queryWorkbench?.mockRows ?? 5, 10));
    const data = Array.from({ length: count }, () =>
      buildMockRow(currentTable.fields.map((f) => ({ name: f.name, type: f.type })))
    );
    setRows(data);
    setQueryTime(ms);
    setRunning(false);
  }, [currentTable, node.queryWorkbench?.mockRows]);

  const DB_COLOR: Record<string, string> = {
    sql: C.primary,
    nosql: C.green,
    kv: C.amber,
    graph: "#a78bfa",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <NodeTitle label={node.label} desc={node.description}>
        <Badge label={node.dbType.toUpperCase()} color={DB_COLOR[node.dbType] ?? C.primary} />
        {node.engine && (
          <span style={{ fontSize: 11, color: C.muted }}>{node.engine}</span>
        )}
      </NodeTitle>

      <div style={{ display: "flex", gap: 12, fontSize: 11, color: C.muted }}>
        <span>Tables: {node.tables.length}</span>
        <span>Pool: {node.performance.connectionPool.min}–{node.performance.connectionPool.max}</span>
        {node.performance.caching.enabled && <span>Cache: {node.performance.caching.strategy}</span>}
      </div>

      {node.tables.length === 0 ? (
        <div style={{ fontSize: 12, color: C.muted }}>
          No tables defined. Add tables in the Database designer to test queries here.
        </div>
      ) : (
        <>
          {/* Table selector */}
          <div>
            <SectionLabel>Table</SectionLabel>
            <select
              style={INPUT_STYLE}
              value={selectedTable}
              onChange={(e) => setSelectedTable(e.target.value)}
            >
              {node.tables.map((t) => (
                <option key={t.name} value={t.name}>{t.name}</option>
              ))}
            </select>
          </div>

          {/* Schema */}
          {currentTable && (
            <Panel>
              <SectionLabel>Schema · {currentTable.name}</SectionLabel>
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", fontSize: 11, width: "100%" }}>
                  <thead>
                    <tr>
                      {["Column", "Type", "Nullable", ""].map((h) => (
                        <th
                          key={h}
                          style={{
                            textAlign: "left",
                            color: C.muted,
                            padding: "4px 10px",
                            borderBottom: `1px solid ${C.border}`,
                            fontWeight: 600,
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {currentTable.fields.map((f, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid #1a2230` }}>
                        <td style={{ padding: "5px 10px", color: C.fg, fontFamily: "monospace" }}>{f.name}</td>
                        <td style={{ padding: "5px 10px", color: C.primary, fontFamily: "monospace" }}>{f.type}</td>
                        <td style={{ padding: "5px 10px", color: f.nullable ? C.muted : C.fg }}>{f.nullable ? "yes" : "no"}</td>
                        <td style={{ padding: "5px 10px", display: "flex", gap: 4 }}>
                          {f.isPrimaryKey && <Badge label="PK" color={C.amber} />}
                          {f.isForeignKey && <Badge label="FK" color={C.primary} />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

          {/* Query editor */}
          <div>
            <SectionLabel>Query Editor</SectionLabel>
            <textarea
              style={{
                ...INPUT_STYLE,
                minHeight: 80,
                resize: "vertical",
                fontFamily: "Menlo, Consolas, monospace",
              }}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              spellCheck={false}
            />
          </div>

          <button style={BTN_STYLE(true)} onClick={runQuery} disabled={running || !currentTable}>
            {running ? <><Spinner /> Running…</> : "▶  Run Query"}
          </button>

          {/* Results table */}
          {rows && rows.length > 0 && (
            <Panel>
              <SectionLabel>
                {rows.length} row{rows.length !== 1 ? "s" : ""} · {queryTime}ms
              </SectionLabel>
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", fontSize: 11, width: "100%" }}>
                  <thead>
                    <tr>
                      {Object.keys(rows[0]).map((k) => (
                        <th
                          key={k}
                          style={{
                            textAlign: "left",
                            color: C.muted,
                            padding: "4px 10px",
                            borderBottom: `1px solid ${C.border}`,
                            fontFamily: "monospace",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {k}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, ri) => (
                      <tr key={ri} style={{ borderBottom: `1px solid #1a2230` }}>
                        {Object.values(row).map((v, ci) => (
                          <td
                            key={ci}
                            style={{
                              padding: "5px 10px",
                              color: v === null ? C.muted : C.fg,
                              fontFamily: "monospace",
                              whiteSpace: "nowrap",
                              maxWidth: 200,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {v === null
                              ? "NULL"
                              : typeof v === "boolean"
                              ? String(v)
                              : typeof v === "object"
                              ? JSON.stringify(v)
                              : String(v)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
        </>
      )}

      {/* Relationships */}
      {node.relationships.length > 0 && (
        <Panel>
          <SectionLabel>Relationships ({node.relationships.length})</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {node.relationships.map((r) => {
              const from = node.tables.find((t) => t.id === r.fromTableId || t.name === r.fromTableId)?.name ?? r.fromTableId;
              const to = node.tables.find((t) => t.id === r.toTableId || t.name === r.toTableId)?.name ?? r.toTableId;
              return (
                <div key={r.id} style={{ fontSize: 11, display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ color: C.fg, fontFamily: "monospace" }}>{from}</span>
                  <span style={{ color: C.muted }}>→</span>
                  <span style={{ color: C.fg, fontFamily: "monospace" }}>{to}</span>
                  <Badge label={r.type.replace(/_/g, ":")} color={C.muted} />
                  <span style={{ color: C.muted }}>on delete: {r.onDelete}</span>
                </div>
              );
            })}
          </div>
        </Panel>
      )}
    </div>
  );
}

// ─── Queue Pane ───────────────────────────────────────────────────────────────

function QueuePane({ node }: { node: QueueBlock }) {
  const defaultPayload = JSON.stringify(
    {
      event: "message.created",
      data: { id: "msg_001", text: "Hello" },
      timestamp: new Date().toISOString(),
    },
    null,
    2
  );
  const [payload, setPayload] = useState(defaultPayload);
  const [publishing, setPublishing] = useState(false);
  const [messages, setMessages] = useState<{ ts: string; payload: string; ok: boolean }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const publish = useCallback(async () => {
    // Validate JSON before "publishing"
    try {
      JSON.parse(payload);
    } catch {
      setError("Invalid JSON payload — fix it before publishing.");
      return;
    }
    setError(null);
    setPublishing(true);
    await wait(randMs(80, 300));
    const ts = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    setMessages((prev) => [{ ts, payload, ok: true }, ...prev].slice(0, 30));
    setPublishing(false);
  }, [payload]);

  const DELIVERY_COLOR: Record<string, string> = {
    at_least_once: C.green,
    at_most_once: C.amber,
    exactly_once: C.primary,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <NodeTitle label={node.label} desc={node.description}>
        <Badge
          label={node.delivery.replace(/_/g, " ")}
          color={DELIVERY_COLOR[node.delivery] ?? C.primary}
        />
      </NodeTitle>

      <div style={{ display: "flex", gap: 12, fontSize: 11, color: C.muted, flexWrap: "wrap" }}>
        <span>Retry: {node.retry.maxAttempts}× {node.retry.backoff}</span>
        <span>DLQ: {node.deadLetter ? "enabled" : "disabled"}</span>
      </div>

      {/* Publisher */}
      <div>
        <SectionLabel>Publish Message</SectionLabel>
        <textarea
          style={{
            ...INPUT_STYLE,
            minHeight: 110,
            resize: "vertical",
            fontFamily: "Menlo, Consolas, monospace",
          }}
          value={payload}
          onChange={(e) => setPayload(e.target.value)}
          spellCheck={false}
        />
        {error && (
          <div style={{ fontSize: 11, color: C.red, marginTop: 4 }}>{error}</div>
        )}
      </div>

      <button style={BTN_STYLE(true)} onClick={publish} disabled={publishing}>
        {publishing ? <><Spinner /> Publishing…</> : "▶  Publish Message"}
      </button>

      {/* Consumer log */}
      {messages.length > 0 && (
        <Panel>
          <SectionLabel>Consumer Log ({messages.length})</SectionLabel>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              maxHeight: 280,
              overflowY: "auto",
            }}
          >
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 10,
                  fontSize: 11,
                  borderBottom: `1px solid #1a2230`,
                  paddingBottom: 6,
                }}
              >
                <span style={{ color: C.green, flexShrink: 0 }}>✓</span>
                <span style={{ color: C.muted, flexShrink: 0 }}>{m.ts}</span>
                <pre
                  style={{
                    margin: 0,
                    color: C.fg,
                    fontFamily: "monospace",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                    flex: 1,
                  }}
                >
                  {m.payload.length > 140 ? m.payload.slice(0, 140) + "…" : m.payload}
                </pre>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

// ─── Infra Pane ───────────────────────────────────────────────────────────────

function MetricBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
        <span style={{ color: C.muted }}>{label}</span>
        <span style={{ color: C.fg, fontWeight: 600 }}>{pct}%</span>
      </div>
      <div
        style={{
          height: 6,
          background: C.bg,
          borderRadius: 999,
          overflow: "hidden",
          border: `1px solid ${C.border}`,
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: color,
            borderRadius: 999,
            transition: "width .4s ease",
          }}
        />
      </div>
    </div>
  );
}

function InfraPane({ node }: { node: InfraBlock }) {
  const resourceType = (node as { resourceType?: string }).resourceType ?? "unknown";
  const config = (node as { config?: Record<string, unknown> }).config ?? {};
  const [metrics] = useState({
    cpu: Math.floor(Math.random() * 55 + 10),
    mem: Math.floor(Math.random() * 50 + 20),
    disk: Math.floor(Math.random() * 40 + 10),
    net: Math.floor(Math.random() * 70 + 10),
  });

  const RT_COLOR: Record<string, string> = {
    ec2: C.amber,
    lambda: C.primary,
    eks: C.green,
    vpc: "#a78bfa",
    s3: C.amber,
    rds: C.primary,
    load_balancer: C.green,
    hpc: C.red,
  };
  const rtColor = RT_COLOR[resourceType] ?? C.primary;

  const configEntries = Object.entries(config)
    .filter(([, v]) => v !== "" && v !== 0 && v !== false)
    .slice(0, 8);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <NodeTitle label={node.label} desc={node.description}>
        <Badge label={resourceType.toUpperCase()} color={rtColor} />
        <Badge label="Healthy" color={C.green} />
      </NodeTitle>

      <div style={{ display: "flex", gap: 12, fontSize: 11, color: C.muted }}>
        <span>{node.provider.toUpperCase()}</span>
        <span>{node.region}</span>
        <span>{node.environment}</span>
      </div>

      {configEntries.length > 0 && (
        <Panel>
          <SectionLabel>Configuration</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {configEntries.map(([k, v]) => (
              <div
                key={k}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 11,
                  gap: 12,
                  alignItems: "flex-start",
                }}
              >
                <span style={{ color: C.muted }}>{k}</span>
                <span
                  style={{
                    color: C.fg,
                    fontFamily: "monospace",
                    textAlign: "right",
                    wordBreak: "break-all",
                    maxWidth: 260,
                  }}
                >
                  {typeof v === "boolean" ? String(v) : String(v)}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel>
        <SectionLabel>Simulated Metrics</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <MetricBar
            label="CPU"
            pct={metrics.cpu}
            color={metrics.cpu > 80 ? C.red : metrics.cpu > 60 ? C.amber : C.green}
          />
          <MetricBar
            label="Memory"
            pct={metrics.mem}
            color={metrics.mem > 80 ? C.red : C.primary}
          />
          <MetricBar label="Disk" pct={metrics.disk} color={C.muted} />
          <MetricBar label="Network" pct={metrics.net} color={C.green} />
        </div>
      </Panel>

      {node.tags?.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {node.tags.map((t) => (
            <Badge key={t} label={t} color={C.muted} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Shared title ─────────────────────────────────────────────────────────────

function NodeTitle({
  label,
  desc,
  children,
}: {
  label: string;
  desc?: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 4,
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 700, color: C.fg }}>{label}</span>
        {children}
      </div>
      {desc && <div style={{ fontSize: 12, color: C.muted }}>{desc}</div>}
    </div>
  );
}

// ─── Sidebar group ────────────────────────────────────────────────────────────

type TNode = { id: string; kind: string; label: string; data: NodeData };

function SidebarGroup({
  title,
  icon,
  items,
  selected,
  onSelect,
}: {
  title: string;
  icon: string;
  items: TNode[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  if (!items.length) return null;
  return (
    <div style={{ marginBottom: 8 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: C.muted,
          letterSpacing: "0.07em",
          textTransform: "uppercase",
          padding: "8px 14px 4px",
        }}
      >
        {icon}&nbsp; {title} ({items.length})
      </div>
      {items.map((n) => {
        const isActive = selected === n.id;
        const api = n.kind === "api_binding" ? (n.data as ApiBinding) : null;
        return (
          <button
            key={n.id}
            type="button"
            onClick={() => onSelect(n.id)}
            style={{
              width: "100%",
              textAlign: "left",
              border: "none",
              background: isActive
                ? `color-mix(in srgb, ${C.primary} 10%, ${C.float})`
                : "transparent",
              color: isActive ? C.fg : "#9aaccc",
              padding: "7px 14px",
              fontSize: 12,
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              gap: 2,
              borderLeft: `2px solid ${isActive ? C.primary : "transparent"}`,
            }}
          >
            <span style={{ fontWeight: isActive ? 600 : 400 }}>
              {api?.method && (
                <span
                  style={{
                    color: METHOD_COLOR[api.method] ?? C.primary,
                    fontFamily: "monospace",
                    fontSize: 10,
                    marginRight: 5,
                    fontWeight: 700,
                  }}
                >
                  {api.method}
                </span>
              )}
              {n.label}
            </span>
            {api?.route && (
              <span
                style={{
                  fontSize: 10,
                  color: C.muted,
                  fontFamily: "monospace",
                }}
              >
                {api.route}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function TestPanel({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const graphs = useStore((s) => s.graphs);

  const nodes = useMemo<TNode[]>(() => {
    return (Object.values(graphs).flatMap((g) => g.nodes) as Node[])
      .filter((n) => {
        const d = n.data as { kind?: string };
        return typeof d?.kind === "string" && d.kind !== "service_boundary";
      })
      .map((n) => ({
        id: n.id,
        kind: (n.data as { kind: string }).kind,
        label: (n.data as { kind: string; label?: string }).label ?? n.id,
        data: n.data as NodeData,
      }));
  }, [graphs]);

  const groups = useMemo(
    () => ({
      apis: nodes.filter((n) => n.kind === "api_binding"),
      functions: nodes.filter((n) => n.kind === "process"),
      databases: nodes.filter((n) => n.kind === "database"),
      queues: nodes.filter((n) => n.kind === "queue"),
      infra: nodes.filter((n) => n.kind === "infra"),
    }),
    [nodes]
  );

  const [selected, setSelected] = useState<string | null>(null);

  // Auto-select the first node on open or when nodes change
  useEffect(() => {
    if (!isOpen) return;
    if (nodes.length > 0 && (!selected || !nodes.find((n) => n.id === selected))) {
      setSelected(nodes[0].id);
    }
  }, [isOpen, nodes]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  const activeNode = nodes.find((n) => n.id === selected) ?? null;
  const isEmpty = nodes.length === 0;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        background: C.bg,
      }}
    >
      {/* ── Top bar ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 18px",
          minHeight: 48,
          borderBottom: `1px solid ${C.border}`,
          background: `color-mix(in srgb, ${C.panel} 94%, #0c111a 6%)`,
          flexShrink: 0,
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: C.green,
              boxShadow: `0 0 8px ${C.green}88`,
            }}
          />
          <span style={{ fontSize: 13, fontWeight: 700, color: C.fg }}>
            Test Environment
          </span>
          <span style={{ fontSize: 11, color: C.muted }}>
            {nodes.length} component{nodes.length !== 1 ? "s" : ""} ·
            all mocked in-browser, no server required
          </span>
        </div>
        <button type="button" onClick={onClose} style={BTN_STYLE()}>
          ✕ Close
        </button>
      </div>

      {/* ── Body ── */}
      {isEmpty ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, color: C.fg }}>
            No components to test
          </div>
          <div style={{ fontSize: 12, color: C.muted }}>
            Add API, Function, Database, Queue, or Infrastructure nodes to your
            canvas first.
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Sidebar */}
          <div
            style={{
              width: 240,
              flexShrink: 0,
              borderRight: `1px solid ${C.border}`,
              background: C.bg,
              overflowY: "auto",
              paddingTop: 8,
              paddingBottom: 16,
            }}
          >
            <SidebarGroup
              title="APIs"
              icon="⬡"
              items={groups.apis}
              selected={selected}
              onSelect={setSelected}
            />
            <SidebarGroup
              title="Functions"
              icon="⚡"
              items={groups.functions}
              selected={selected}
              onSelect={setSelected}
            />
            <SidebarGroup
              title="Databases"
              icon="◈"
              items={groups.databases}
              selected={selected}
              onSelect={setSelected}
            />
            <SidebarGroup
              title="Queues"
              icon="⇌"
              items={groups.queues}
              selected={selected}
              onSelect={setSelected}
            />
            <SidebarGroup
              title="Infrastructure"
              icon="⬜"
              items={groups.infra}
              selected={selected}
              onSelect={setSelected}
            />
          </div>

          {/* Main content */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: 28,
              maxWidth: 760,
            }}
          >
            {activeNode ? (
              <React.Fragment key={activeNode.id}>
                {activeNode.kind === "api_binding" && (
                  <ApiPane node={activeNode.data as ApiBinding} />
                )}
                {activeNode.kind === "process" && (
                  <FunctionPane node={activeNode.data as ProcessDefinition} />
                )}
                {activeNode.kind === "database" && (
                  <DatabasePane node={activeNode.data as DatabaseBlock} />
                )}
                {activeNode.kind === "queue" && (
                  <QueuePane node={activeNode.data as QueueBlock} />
                )}
                {activeNode.kind === "infra" && (
                  <InfraPane node={activeNode.data as InfraBlock} />
                )}
              </React.Fragment>
            ) : (
              <div style={{ fontSize: 12, color: C.muted }}>
                Select a component from the sidebar.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
