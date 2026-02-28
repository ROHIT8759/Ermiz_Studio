"use client";

import React, { useMemo, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import {
  DatabaseBlock,
  DatabaseFieldType,
  DatabaseOrmTarget,
  DatabaseTable,
} from "@/lib/schema/node";

const inputStyle: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "6px 8px",
  background: "var(--background)",
  color: "var(--foreground)",
  fontSize: 12,
};

const buttonStyle: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "6px 10px",
  background: "var(--floating)",
  color: "var(--foreground)",
  fontSize: 11,
  cursor: "pointer",
};

const sampleForType = (type: DatabaseFieldType, index: number): unknown => {
  switch (type) {
    case "int":
    case "bigint":
      return index + 1;
    case "float":
    case "decimal":
      return Number((index + 1.25).toFixed(2));
    case "boolean":
      return index % 2 === 0;
    case "datetime":
      return `2026-01-${String((index % 28) + 1).padStart(2, "0")}T10:00:00Z`;
    case "json":
      return { sample: true, i: index };
    case "uuid":
      return `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    case "text":
    case "string":
    default:
      return `value_${index + 1}`;
  }
};

const estimateComplexity = (query: string): { score: number; note: string } => {
  const q = query.toLowerCase();
  let score = 1;
  if (q.includes(" join ")) score += 2;
  if (q.includes(" group by ") || q.includes(" order by ")) score += 1;
  if (q.includes("*")) score += 1;
  if (q.includes(" where ")) score += 1;
  if (!q.includes(" limit ") && q.startsWith("select")) score += 1;
  const bounded = Math.min(score, 5);
  const note =
    bounded <= 2
      ? "Low"
      : bounded === 3
        ? "Moderate"
        : bounded === 4
          ? "High"
          : "Very high";
  return { score: bounded, note };
};

const validateForDbType = (
  query: string,
  dbType: DatabaseBlock["dbType"],
): { valid: boolean; message: string } => {
  const trimmed = query.trim();
  if (!trimmed) return { valid: false, message: "Query is empty." };
  const q = trimmed.toLowerCase();
  if (dbType === "sql") {
    const ok =
      q.startsWith("select") ||
      q.startsWith("insert") ||
      q.startsWith("update") ||
      q.startsWith("delete");
    return {
      valid: ok,
      message: ok
        ? "SQL syntax looks valid for a draft query."
        : "For SQL, start with SELECT/INSERT/UPDATE/DELETE.",
    };
  }
  if (dbType === "nosql") {
    const ok = q.startsWith("db.") || q.startsWith("{") || q.includes(".find(");
    return {
      valid: ok,
      message: ok
        ? "NoSQL query format looks valid."
        : "For NoSQL, use patterns like db.collection.find({...}).",
    };
  }
  if (dbType === "kv") {
    const ok = q.startsWith("get ") || q.startsWith("set ") || q.startsWith("del ");
    return {
      valid: ok,
      message: ok ? "KV command format looks valid." : "Use GET/SET/DEL for key-value.",
    };
  }
  const ok = q.startsWith("match ") || q.startsWith("create ") || q.includes("-[");
  return {
    valid: ok,
    message: ok ? "Graph query pattern looks valid." : "Use MATCH/CREATE for graph queries.",
  };
};

const parseSqlFrom = (query: string): { tableName?: string; limit?: number } => {
  const fromMatch = query.match(/\bfrom\s+["`]?([a-zA-Z_][\w]*)["`]?/i);
  const limitMatch = query.match(/\blimit\s+(\d+)/i);
  return {
    tableName: fromMatch?.[1],
    limit: limitMatch ? Number(limitMatch[1]) : undefined,
  };
};

const buildOrmSnippet = (
  ormTarget: DatabaseOrmTarget,
  table: DatabaseTable | undefined,
): string => {
  const tableName = table?.name || "YourModel";
  const whereField = table?.fields.find((f) => !f.primaryKey)?.name || "field";
  if (ormTarget === "prisma") {
    return `const rows = await prisma.${tableName}.findMany({
  where: { ${whereField}: "value_1" },
  take: 20,
});`;
  }
  if (ormTarget === "typeorm") {
    return `const repo = dataSource.getRepository("${tableName}");
const rows = await repo.find({
  where: { ${whereField}: "value_1" },
  take: 20,
});`;
  }
  return `const rows = await ${tableName}Model.find({
  ${whereField}: "value_1",
}).limit(20);`;
};

export function DatabaseQueryBuilder() {
  const nodes = useStore((state) => state.nodes);
  const updateNodeData = useStore((state) => state.updateNodeData);
  const queryRef = useRef<HTMLTextAreaElement | null>(null);
  const [resultJson, setResultJson] = useState<string>("");

  const databaseNodes = useMemo(
    () =>
      nodes.filter(
        (node): node is typeof node & { data: DatabaseBlock } =>
          typeof node.data === "object" &&
          node.data !== null &&
          "kind" in node.data &&
          node.data.kind === "database",
      ),
    [nodes],
  );
  const activeDatabaseNode =
    databaseNodes.find((node) => node.selected) || databaseNodes[0];
  const dbData = activeDatabaseNode?.data;
  const tables = useMemo(() => dbData?.tables || [], [dbData]);

  const setWorkbench = (updates: Partial<DatabaseBlock["queryWorkbench"]>) => {
    if (!activeDatabaseNode || !dbData) return;
    updateNodeData(activeDatabaseNode.id, {
      queryWorkbench: {
        ...(dbData.queryWorkbench || { query: "", ormTarget: "prisma", mockRows: 5 }),
        ...updates,
      },
    } as Partial<DatabaseBlock>);
  };

  const queryText = dbData?.queryWorkbench?.query || "";
  const ormTarget = dbData?.queryWorkbench?.ormTarget || "prisma";
  const mockRows = dbData?.queryWorkbench?.mockRows || 5;

  const validation = useMemo(
    () => validateForDbType(queryText, dbData?.dbType || "sql"),
    [dbData?.dbType, queryText],
  );
  const complexity = useMemo(() => estimateComplexity(queryText), [queryText]);

  const suggestions = useMemo(() => {
    const values = new Set<string>();
    for (const table of tables) {
      values.add(table.name);
      values.add(`SELECT * FROM ${table.name} LIMIT 20`);
      for (const field of table.fields) {
        values.add(field.name);
        values.add(`${table.name}.${field.name}`);
      }
    }
    return Array.from(values).slice(0, 30);
  }, [tables]);

  const applySuggestion = (token: string) => {
    if (!queryRef.current) {
      setWorkbench({ query: `${queryText} ${token}`.trim() });
      return;
    }
    const target = queryRef.current;
    const start = target.selectionStart ?? queryText.length;
    const end = target.selectionEnd ?? queryText.length;
    const before = queryText.slice(0, start);
    const after = queryText.slice(end);
    const next = `${before}${token}${after}`;
    setWorkbench({ query: next });
    requestAnimationFrame(() => {
      target.focus();
      const cursor = before.length + token.length;
      target.setSelectionRange(cursor, cursor);
    });
  };

  const runMockQuery = () => {
    if (!dbData) return;
    if (dbData.dbType !== "sql") {
      const payload = {
        dbType: dbData.dbType,
        query: queryText,
        status: "executed_with_mock_adapter",
        rows: [],
      };
      setResultJson(JSON.stringify(payload, null, 2));
      return;
    }

    const parsed = parseSqlFrom(queryText);
    const table = tables.find((t) => t.name.toLowerCase() === parsed.tableName?.toLowerCase());
    if (!table) {
      setResultJson(
        JSON.stringify(
          {
            error: "Table not found in current schema model.",
            parsedTable: parsed.tableName || null,
          },
          null,
          2,
        ),
      );
      return;
    }
    const take = Math.max(1, Math.min(parsed.limit || mockRows, 30));
    const rows = Array.from({ length: take }, (_, i) => {
      const row: Record<string, unknown> = {};
      for (const field of table.fields) {
        row[field.name] = sampleForType(field.type, i);
      }
      return row;
    });
    setResultJson(
      JSON.stringify(
        {
          table: table.name,
          estimatedRows: take,
          rows,
        },
        null,
        2,
      ),
    );
  };

  const selectedTable = useMemo(() => {
    const parsed = parseSqlFrom(queryText);
    return tables.find((table) => table.name.toLowerCase() === parsed.tableName?.toLowerCase());
  }, [queryText, tables]);

  const ormSnippet = useMemo(
    () => buildOrmSnippet(ormTarget, selectedTable || tables[0]),
    [ormTarget, selectedTable, tables],
  );

  if (!dbData) return null;

  return (
    <section
      style={{
        borderTop: "1px solid var(--border)",
        background: "color-mix(in srgb, var(--panel) 95%, #0c111a 5%)",
        maxHeight: "30vh",
        minHeight: 220,
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
      }}
    >
      <div style={{ display: "grid", gridTemplateRows: "auto auto 1fr auto", minHeight: 0 }}>
        <div
          style={{
            padding: "10px 12px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div>
            <div style={{ fontSize: 12, fontWeight: 700 }}>Query Builder & Test Interface</div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>
              {dbData.dbType.toUpperCase()} validation • autocomplete • mock execution
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                border: "1px solid var(--border)",
                borderRadius: 999,
                padding: "2px 8px",
                fontSize: 10,
                color: complexity.score >= 4 ? "#fca5a5" : "var(--secondary)",
              }}
            >
              Complexity {complexity.score}/5 ({complexity.note})
            </span>
          </div>
        </div>

        <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {suggestions.slice(0, 12).map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => applySuggestion(suggestion)}
              style={{
                ...buttonStyle,
                padding: "4px 8px",
                fontSize: 10,
                whiteSpace: "nowrap",
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>

        <div style={{ padding: 10, overflow: "auto" }}>
          <textarea
            ref={queryRef}
            value={queryText}
            onChange={(event) => setWorkbench({ query: event.target.value })}
            placeholder={
              dbData.dbType === "sql"
                ? "SELECT * FROM users WHERE id = 1 LIMIT 20"
                : dbData.dbType === "nosql"
                  ? "db.users.find({ active: true })"
                  : dbData.dbType === "kv"
                    ? "GET user:1"
                    : "MATCH (u:User)-[:HAS]->(o:Order) RETURN u,o"
            }
            style={{
              width: "100%",
              minHeight: 120,
              resize: "vertical",
              border: "1px solid var(--border)",
              borderRadius: 8,
              background: "var(--background)",
              color: "var(--foreground)",
              padding: 10,
              fontSize: 12,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}
          />
        </div>

        <div
          style={{
            padding: "8px 12px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 11, color: validation.valid ? "#86efac" : "#fca5a5" }}>
            {validation.message}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ fontSize: 11, color: "var(--muted)" }}>Rows</label>
            <input
              type="number"
              min={1}
              max={50}
              value={mockRows}
              onChange={(event) =>
                setWorkbench({
                  mockRows: Math.max(1, Math.min(50, Number(event.target.value) || 5)),
                })
              }
              style={{ ...inputStyle, width: 72 }}
            />
            <button type="button" onClick={runMockQuery} style={buttonStyle}>
              Run Mock Query
            </button>
          </div>
        </div>
      </div>

      <div
        style={{
          borderLeft: "1px solid var(--border)",
          display: "grid",
          gridTemplateRows: "auto 1fr 1fr",
          minHeight: 0,
        }}
      >
        <div
          style={{
            padding: "10px 12px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 600 }}>Generated ORM Code</span>
          <select
            value={ormTarget}
            onChange={(event) =>
              setWorkbench({ ormTarget: event.target.value as DatabaseOrmTarget })
            }
            style={{ ...inputStyle, width: 120 }}
          >
            <option value="prisma">Prisma</option>
            <option value="typeorm">TypeORM</option>
            <option value="mongoose">Mongoose</option>
          </select>
        </div>

        <textarea
          readOnly
          value={ormSnippet}
          style={{
            width: "100%",
            height: "100%",
            border: "none",
            borderBottom: "1px solid var(--border)",
            outline: "none",
            resize: "none",
            background: "transparent",
            color: "var(--secondary)",
            padding: 10,
            fontSize: 11,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          }}
        />

        <textarea
          readOnly
          value={resultJson || "{\n  \"result\": \"Run mock query to preview output\"\n}"}
          style={{
            width: "100%",
            height: "100%",
            border: "none",
            outline: "none",
            resize: "none",
            background: "transparent",
            color: "var(--secondary)",
            padding: 10,
            fontSize: 11,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          }}
        />
      </div>
    </section>
  );
}
