"use client";

import React, { useMemo, useState } from "react";
import {
  DatabaseBlock,
  DatabaseQuery,
  DatabaseQueryComplexity,
  DatabaseQueryOperation,
} from "@/lib/schema/node";

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--background)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  padding: "6px 8px",
  fontSize: 12,
  color: "var(--foreground)",
  outline: "none",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: "pointer",
};

const getGeneratedCode = (
  dbType: DatabaseBlock["dbType"],
  query: Pick<DatabaseQuery, "operation" | "target" | "conditions">,
): string => {
  const target = query.target || "table_name";
  const condition = query.conditions.trim();
  const sqlWhere = condition ? ` WHERE ${condition}` : "";
  const mongoCondition = condition || "{}";

  if (dbType === "nosql") {
    if (query.operation === "SELECT") return `db.${target}.find(${mongoCondition})`;
    if (query.operation === "INSERT") return `db.${target}.insertOne({ ...document })`;
    if (query.operation === "UPDATE") {
      return `db.${target}.updateMany(${mongoCondition}, { $set: { ...updates } })`;
    }
    return `db.${target}.deleteMany(${mongoCondition})`;
  }

  if (query.operation === "SELECT") return `SELECT * FROM ${target}${sqlWhere};`;
  if (query.operation === "INSERT") return `INSERT INTO ${target} (...) VALUES (...);`;
  if (query.operation === "UPDATE") return `UPDATE ${target} SET ...${sqlWhere};`;
  return `DELETE FROM ${target}${sqlWhere};`;
};

const getConditionFields = (
  conditions: string,
  tableFieldNames: string[],
): string[] => {
  if (!conditions.trim() || tableFieldNames.length === 0) return [];
  const tableFieldSet = new Set(tableFieldNames.map((name) => name.toLowerCase()));
  const matches = conditions.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
  const fields = matches
    .map((token) => token.toLowerCase())
    .filter((token) => tableFieldSet.has(token));
  return Array.from(new Set(fields));
};

const parseIndexedFields = (
  indexes: string[],
  tableFieldNames: string[],
): Set<string> => {
  const indexed = new Set<string>();
  const fieldMap = new Map(tableFieldNames.map((field) => [field.toLowerCase(), field]));
  indexes.forEach((indexDef) => {
    const parts = indexDef.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
    parts.forEach((part) => {
      const normalized = part.toLowerCase();
      if (fieldMap.has(normalized)) {
        indexed.add(normalized);
      }
    });
  });
  return indexed;
};

const analyzeQueryPerformance = (
  database: DatabaseBlock,
  query: Pick<DatabaseQuery, "operation" | "target" | "conditions">,
) => {
  const targetTable = (database.tables || []).find((table) => table.name === query.target);
  const tableFieldNames = (targetTable?.fields || []).map((field) => field.name);
  const conditionFields = getConditionFields(query.conditions, tableFieldNames);
  const indexedFields = parseIndexedFields(targetTable?.indexes || [], tableFieldNames);
  (targetTable?.fields || []).forEach((field) => {
    if (field.isPrimaryKey) indexedFields.add(field.name.toLowerCase());
  });

  const usesIndex =
    conditionFields.length > 0 &&
    conditionFields.some((field) => indexedFields.has(field.toLowerCase()));
  const suggestedIndexes =
    conditionFields.length === 0 || usesIndex
      ? []
      : conditionFields
          .filter((field) => !indexedFields.has(field.toLowerCase()))
          .map((field) => `${query.target}.${field}`);

  const joinCount = (query.conditions.match(/\bjoin\b/gi) || []).length;
  const predicateCount = query.conditions.trim()
    ? 1 + (query.conditions.match(/\b(and|or)\b/gi) || []).length
    : 0;

  let score = 1;
  if (joinCount > 0) score += joinCount * 2;
  if (predicateCount >= 3) score += 1;
  if (predicateCount >= 6) score += 1;
  if (predicateCount > 0 && !usesIndex) score += 1;
  if (query.operation !== "SELECT") score += 1;

  const complexity: DatabaseQueryComplexity =
    score <= 2 ? "simple" : score <= 4 ? "moderate" : "complex";

  const baseRows = 10000;
  let estimatedRowsScanned = baseRows;
  if (query.operation === "INSERT") {
    estimatedRowsScanned = 1;
  } else if (predicateCount > 0) {
    const selectivityFactor = usesIndex ? 0.12 : 0.55;
    estimatedRowsScanned = Math.round(
      (baseRows * selectivityFactor * Math.max(1, joinCount + 1)) /
        Math.max(1, predicateCount),
    );
  }
  estimatedRowsScanned = Math.max(1, estimatedRowsScanned);

  return {
    complexity,
    usesIndex,
    suggestedIndexes,
    estimatedRowsScanned,
  };
};

const getComplexityBadge = (complexity: DatabaseQueryComplexity) => {
  if (complexity === "simple") return "🟢";
  if (complexity === "moderate") return "🟡";
  return "🔴";
};

type QueryEditorProps = {
  database: DatabaseBlock;
  onChange: (queries: DatabaseQuery[]) => void;
};

export function QueryEditor({ database, onChange }: QueryEditorProps) {
  const [expandedById, setExpandedById] = useState<Record<string, boolean>>({});
  const queries = database.queries || [];
  const targetOptions = useMemo(
    () =>
      (database.schemas || []).length > 0
        ? database.schemas
        : (database.tables || []).map((table) => table.name),
    [database.schemas, database.tables],
  );

  const updateQuery = (
    queryId: string,
    updates: Partial<Omit<DatabaseQuery, "id">>,
  ) => {
    const next = queries.map((query) => {
      if (query.id !== queryId) return query;
      const merged = { ...query, ...updates };
      const performance = analyzeQueryPerformance(database, merged);
      return {
        ...merged,
        generatedCode: getGeneratedCode(database.dbType, merged),
        ...performance,
      };
    });
    onChange(next);
  };

  const addQuery = () => {
    const id = `query_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    const target = targetOptions[0] || "";
    const query: DatabaseQuery = {
      id,
      name: `Query ${queries.length + 1}`,
      operation: "SELECT",
      target,
      conditions: "",
      generatedCode: getGeneratedCode(database.dbType, {
        operation: "SELECT",
        target,
        conditions: "",
      }),
      ...analyzeQueryPerformance(database, {
        operation: "SELECT",
        target,
        conditions: "",
      }),
    };
    onChange([...queries, query]);
    setExpandedById((prev) => ({ ...prev, [id]: true }));
  };

  const removeQuery = (queryId: string) => {
    onChange(queries.filter((query) => query.id !== queryId));
  };

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase" }}>
          Queries
        </div>
        <button
          type="button"
          onClick={addQuery}
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
          + Query
        </button>
      </div>

      {queries.length === 0 && (
        <div style={{ fontSize: 11, color: "var(--muted)" }}>No queries yet.</div>
      )}

      {queries.map((query) => {
        const isExpanded = expandedById[query.id] ?? false;
        const performance = analyzeQueryPerformance(database, query);
        const complexity = query.complexity || performance.complexity;
        const usesIndex =
          typeof query.usesIndex === "boolean" ? query.usesIndex : performance.usesIndex;
        const estimatedRowsScanned =
          typeof query.estimatedRowsScanned === "number"
            ? query.estimatedRowsScanned
            : performance.estimatedRowsScanned;
        const suggestedIndexes =
          query.suggestedIndexes || performance.suggestedIndexes;
        return (
          <div
            key={query.id}
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
                  setExpandedById((prev) => ({ ...prev, [query.id]: !isExpanded }))
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
                {isExpanded ? "▾" : "▸"}
              </button>
              <span style={{ fontSize: 12, color: "var(--foreground)", minWidth: 0 }}>
                {query.name}
              </span>
              <span style={{ fontSize: 12 }} title={complexity}>
                {getComplexityBadge(complexity)}
              </span>
              <button
                type="button"
                onClick={() => removeQuery(query.id)}
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
                Remove
              </button>
            </div>

            {isExpanded && (
              <div
                style={{
                  borderTop: "1px solid var(--border)",
                  padding: 8,
                  display: "grid",
                  gap: 8,
                }}
              >
                <input
                  value={query.name}
                  onChange={(e) => updateQuery(query.id, { name: e.target.value })}
                  placeholder="Query name"
                  style={inputStyle}
                />

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  <select
                    value={query.operation}
                    onChange={(e) =>
                      updateQuery(query.id, {
                        operation: e.target.value as DatabaseQueryOperation,
                      })
                    }
                    style={selectStyle}
                  >
                    <option value="SELECT">SELECT</option>
                    <option value="INSERT">INSERT</option>
                    <option value="UPDATE">UPDATE</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                  <select
                    value={query.target}
                    onChange={(e) => updateQuery(query.id, { target: e.target.value })}
                    style={selectStyle}
                  >
                    {targetOptions.length === 0 ? (
                      <option value="">No tables</option>
                    ) : (
                      targetOptions.map((schema) => (
                        <option key={schema} value={schema}>
                          {schema}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <input
                  value={query.conditions}
                  onChange={(e) => updateQuery(query.id, { conditions: e.target.value })}
                  placeholder={
                    database.dbType === "nosql"
                      ? "{ active: true }"
                      : "id = 1 AND status = 'active'"
                  }
                  style={inputStyle}
                />

                <div
                  style={{
                    border: "1px solid var(--border)",
                    background: "var(--panel)",
                    borderRadius: 4,
                    padding: 8,
                    fontSize: 11,
                    color: "var(--secondary)",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {query.generatedCode || getGeneratedCode(database.dbType, query)}
                </div>

                <div
                  style={{
                    border: "1px solid var(--border)",
                    background: "var(--panel)",
                    borderRadius: 4,
                    padding: 8,
                    display: "grid",
                    gap: 6,
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--muted)",
                      textTransform: "uppercase",
                    }}
                  >
                    Performance
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    <div style={{ fontSize: 11, color: "var(--secondary)" }}>
                      {getComplexityBadge(complexity)} {complexity}
                    </div>
                    <div style={{ fontSize: 11, color: usesIndex ? "var(--secondary)" : "var(--muted)" }}>
                      Index usage: {usesIndex ? "Yes" : "No"}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>
                      Estimated rows scanned
                    </div>
                    <div style={{ fontSize: 11, color: "var(--foreground)" }}>
                      {estimatedRowsScanned.toLocaleString()}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>
                    Suggested indexes:{" "}
                    {suggestedIndexes.length > 0 ? suggestedIndexes.join(", ") : "None"}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
