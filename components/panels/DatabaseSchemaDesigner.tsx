"use client";

import React, { useMemo } from "react";
import { useStore } from "@/store/useStore";
import {
  DatabaseBlock,
  DatabaseFieldType,
  DatabaseRelationType,
  DatabaseRelationship,
  DatabaseTable,
  DatabaseTableField,
} from "@/lib/schema/node";

const fieldTypes: DatabaseFieldType[] = [
  "string",
  "text",
  "int",
  "bigint",
  "float",
  "decimal",
  "boolean",
  "datetime",
  "json",
  "uuid",
];

const relationTypes: DatabaseRelationType[] = [
  "one_to_one",
  "one_to_many",
  "many_to_many",
];

const inputStyle: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "6px 8px",
  background: "var(--background)",
  color: "var(--foreground)",
  fontSize: 12,
};

const smallButton: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "6px 8px",
  background: "var(--floating)",
  color: "var(--foreground)",
  fontSize: 11,
  cursor: "pointer",
};

const getSqlType = (type: DatabaseFieldType): string => {
  switch (type) {
    case "string":
      return "VARCHAR(255)";
    case "text":
      return "TEXT";
    case "int":
      return "INTEGER";
    case "bigint":
      return "BIGINT";
    case "float":
      return "FLOAT";
    case "decimal":
      return "DECIMAL(10,2)";
    case "boolean":
      return "BOOLEAN";
    case "datetime":
      return "TIMESTAMP";
    case "json":
      return "JSONB";
    case "uuid":
      return "UUID";
    default:
      return "TEXT";
  }
};

const getPrismaType = (type: DatabaseFieldType): string => {
  switch (type) {
    case "string":
    case "text":
    case "uuid":
      return "String";
    case "int":
      return "Int";
    case "bigint":
      return "BigInt";
    case "float":
      return "Float";
    case "decimal":
      return "Decimal";
    case "boolean":
      return "Boolean";
    case "datetime":
      return "DateTime";
    case "json":
      return "Json";
    default:
      return "String";
  }
};

const ensureDefaultField = (): DatabaseTableField => ({
  id: `field_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  name: "id",
  type: "uuid",
  required: true,
  unique: true,
  primaryKey: true,
});

export function DatabaseSchemaDesigner() {
  const nodes = useStore((state) => state.nodes);
  const updateNodeData = useStore((state) => state.updateNodeData);

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
  const activeDatabaseData = activeDatabaseNode?.data;
  const tables = useMemo(() => activeDatabaseData?.tables ?? [], [activeDatabaseData]);
  const relationships = useMemo(
    () => activeDatabaseData?.relationships ?? [],
    [activeDatabaseData],
  );

  const setDatabaseData = (updates: Partial<DatabaseBlock>) => {
    if (!activeDatabaseNode) return;
    const nextTables = updates.tables ?? tables;
    updateNodeData(activeDatabaseNode.id, {
      ...updates,
      schemas: nextTables.map((table) => table.name),
    } as Partial<DatabaseBlock>);
  };

  const addTable = () => {
    if (!activeDatabaseData) return;
    const nextTable: DatabaseTable = {
      id: `table_${Date.now()}`,
      name: `table_${tables.length + 1}`,
      fields: [ensureDefaultField()],
    };
    setDatabaseData({
      tables: [...tables, nextTable],
    });
  };

  const updateTable = (tableId: string, updates: Partial<DatabaseTable>) => {
    if (!activeDatabaseData) return;
    const nextTables = tables.map((table) =>
      table.id === tableId ? { ...table, ...updates } : table,
    );
    setDatabaseData({ tables: nextTables });
  };

  const removeTable = (tableId: string) => {
    if (!activeDatabaseData) return;
    const nextTables = tables.filter((table) => table.id !== tableId);
    const nextRelationships = relationships.filter(
      (relation) =>
        relation.fromTableId !== tableId && relation.toTableId !== tableId,
    );
    setDatabaseData({ tables: nextTables, relationships: nextRelationships });
  };

  const addField = (tableId: string) => {
    if (!activeDatabaseData) return;
    const nextTables = tables.map((table) => {
      if (table.id !== tableId) return table;
      const field: DatabaseTableField = {
        id: `field_${Date.now()}`,
        name: `field_${table.fields.length + 1}`,
        type: "string",
        required: false,
        unique: false,
        primaryKey: false,
      };
      return { ...table, fields: [...table.fields, field] };
    });
    setDatabaseData({ tables: nextTables });
  };

  const updateField = (
    tableId: string,
    fieldId: string,
    updates: Partial<DatabaseTableField>,
  ) => {
    if (!activeDatabaseData) return;
    const nextTables = tables.map((table) => {
      if (table.id !== tableId) return table;
      return {
        ...table,
        fields: table.fields.map((field) =>
          field.id === fieldId ? { ...field, ...updates } : field,
        ),
      };
    });
    setDatabaseData({ tables: nextTables });
  };

  const removeField = (tableId: string, fieldId: string) => {
    if (!activeDatabaseData) return;
    const nextTables = tables.map((table) => {
      if (table.id !== tableId) return table;
      return {
        ...table,
        fields: table.fields.filter((field) => field.id !== fieldId),
      };
    });
    const nextRelationships = relationships.filter(
      (relation) =>
        relation.fromFieldId !== fieldId && relation.toFieldId !== fieldId,
    );
    setDatabaseData({ tables: nextTables, relationships: nextRelationships });
  };

  const addRelationship = () => {
    if (!activeDatabaseData || tables.length < 2) return;
    const [fromTable, toTable] = tables;
    if (!fromTable.id || !toTable.id) return;
    const next: DatabaseRelationship = {
      id: `rel_${Date.now()}`,
      type: "one_to_many",
      fromTableId: fromTable.id,
      toTableId: toTable.id,
      fromFieldId: fromTable.fields[0]?.id,
      toFieldId: toTable.fields[0]?.id,
      onDelete: "no_action",
    };
    setDatabaseData({
      relationships: [...relationships, next],
    });
  };

  const updateRelationship = (
    relationId: string,
    updates: Partial<DatabaseRelationship>,
  ) => {
    if (!activeDatabaseData) return;
    const nextRelationships = relationships.map((relation) =>
      relation.id === relationId ? { ...relation, ...updates } : relation,
    );
    setDatabaseData({ relationships: nextRelationships });
  };

  const removeRelationship = (relationId: string) => {
    if (!activeDatabaseData) return;
    const nextRelationships = relationships.filter(
      (relation) => relation.id !== relationId,
    );
    setDatabaseData({ relationships: nextRelationships });
  };

  const tableById = useMemo(() => {
    const map = new Map<string, DatabaseTable>();
    for (const table of tables) {
      if (table.id) {
        map.set(table.id, table);
      }
    }
    return map;
  }, [tables]);

  const prismaSchema = useMemo(() => {
    if (!activeDatabaseData || tables.length === 0) return "";
    const models = tables.map((table) => {
      const fields = table.fields.map((field) => {
        const prismaType = getPrismaType(field.type);
        const nullability = field.required ? "" : "?";
        const attrs: string[] = [];
        if (field.primaryKey) attrs.push("@id");
        if (field.unique && !field.primaryKey) attrs.push("@unique");
        if (field.defaultValue) attrs.push(`@default(${field.defaultValue})`);
        if (field.type === "uuid" && field.primaryKey && !field.defaultValue) {
          attrs.push("@default(uuid())");
        }
        return `  ${field.name} ${prismaType}${nullability}${attrs.length ? ` ${attrs.join(" ")}` : ""}`;
      });
      return `model ${table.name} {\n${fields.join("\n")}\n}`;
    });
    return models.join("\n\n");
  }, [activeDatabaseData, tables]);

  const migrationSql = useMemo(() => {
    if (!activeDatabaseData || tables.length === 0) return "";
    const createStatements = tables.map((table) => {
      const fieldLines = table.fields.map((field) => {
        const parts: string[] = [`"${field.name}"`, getSqlType(field.type)];
        if (field.required || field.primaryKey) parts.push("NOT NULL");
        if (field.unique) parts.push("UNIQUE");
        if (field.defaultValue) parts.push(`DEFAULT ${field.defaultValue}`);
        return parts.join(" ");
      });
      const pkFields = table.fields.filter((field) => field.primaryKey).map((field) => `"${field.name}"`);
      if (pkFields.length > 0) {
        fieldLines.push(`PRIMARY KEY (${pkFields.join(", ")})`);
      }
      return `CREATE TABLE "${table.name}" (\n  ${fieldLines.join(",\n  ")}\n);`;
    });

    const relationshipStatements = relationships
      .filter((relation) => relation.fromFieldId && relation.toFieldId)
      .map((relation) => {
        const fromTable = tableById.get(relation.fromTableId);
        const toTable = tableById.get(relation.toTableId);
        const fromField = fromTable?.fields.find((field) => field.id === relation.fromFieldId);
        const toField = toTable?.fields.find((field) => field.id === relation.toFieldId);
        if (!fromTable || !toTable || !fromField || !toField) return "";
        return `ALTER TABLE "${fromTable.name}" ADD CONSTRAINT "fk_${fromTable.name}_${fromField.name}" FOREIGN KEY ("${fromField.name}") REFERENCES "${toTable.name}"("${toField.name}") ON DELETE ${relation.onDelete.toUpperCase().replace("_", " ")};`;
      })
      .filter(Boolean);

    return [...createStatements, ...relationshipStatements].join("\n\n");
  }, [activeDatabaseData, relationships, tableById, tables]);

  const graphLayout = useMemo(() => {
    return tables.map((table, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      return {
        id: table.id,
        x: 120 + col * 240,
        y: 50 + row * 130,
        label: table.name,
      };
    });
  }, [tables]);

  const pointByTableId = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    for (const node of graphLayout) {
      if (node.id) {
        map.set(node.id, { x: node.x, y: node.y });
      }
    }
    return map;
  }, [graphLayout]);

  if (!activeDatabaseNode || !activeDatabaseData) {
    return (
      <section
        style={{
          borderTop: "1px solid var(--border)",
          background: "color-mix(in srgb, var(--panel) 94%, #0c111a 6%)",
          padding: 14,
          color: "var(--muted)",
          fontSize: 12,
        }}
      >
        Add and select a database node to start designing tables, fields, and relationships.
      </section>
    );
  }

  return (
    <section
      style={{
        borderTop: "1px solid var(--border)",
        background: "color-mix(in srgb, var(--panel) 94%, #0c111a 6%)",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
        height: "100%",
        minHeight: 0,
      }}
    >
      <div style={{ display: "grid", gridTemplateRows: "auto 1fr", minHeight: 0 }}>
        <div
          style={{
            padding: "10px 12px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: 12, fontWeight: 700 }}>Visual Schema Designer</div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>
              {activeDatabaseData.label} • {tables.length} tables •{" "}
              {relationships.length} relationships
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={smallButton} onClick={addTable}>
              + Table
            </button>
            <button
              type="button"
              style={smallButton}
              onClick={addRelationship}
              disabled={tables.length < 2}
            >
              + Relation
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", minHeight: 0 }}>
          <div style={{ overflow: "auto", padding: 10, display: "grid", gap: 10 }}>
            {tables.filter((t) => t.id).map((table) => (
              <article
                key={table.id}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  background: "var(--panel)",
                  padding: 10,
                  display: "grid",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    value={table.name}
                    onChange={(event) =>
                      updateTable(table.id!, { name: event.target.value || table.name })
                    }
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button
                    type="button"
                    style={smallButton}
                    onClick={() => removeTable(table.id!)}
                  >
                    Remove
                  </button>
                </div>
                {table.fields.filter((f) => f.id).map((field) => (
                  <div
                    key={field.id}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: 8,
                      background: "var(--floating)",
                      display: "grid",
                      gap: 6,
                    }}
                  >
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 6 }}>
                      <input
                        value={field.name}
                        onChange={(event) =>
                          updateField(table.id!, field.id!, { name: event.target.value })
                        }
                        style={inputStyle}
                      />
                      <select
                        value={field.type}
                        onChange={(event) =>
                          updateField(table.id!, field.id!, {
                            type: event.target.value as DatabaseFieldType,
                          })
                        }
                        style={inputStyle}
                      >
                        {fieldTypes.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        style={smallButton}
                        onClick={() => removeField(table.id!, field.id!)}
                      >
                        x
                      </button>
                    </div>
                    <input
                      value={field.defaultValue || ""}
                      onChange={(event) =>
                        updateField(table.id!, field.id!, {
                          defaultValue: event.target.value || undefined,
                        })
                      }
                      placeholder="default (optional)"
                      style={inputStyle}
                    />
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {[
                        { key: "required", label: "Required" },
                        { key: "unique", label: "Unique" },
                        { key: "primaryKey", label: "Primary Key" },
                      ].map((option) => (
                        <label
                          key={option.key}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            fontSize: 11,
                            color: "var(--muted)",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(field[option.key as keyof DatabaseTableField])}
                            onChange={(event) =>
                              updateField(table.id!, field.id!, {
                                [option.key]: event.target.checked,
                              } as Partial<DatabaseTableField>)
                            }
                          />
                          {option.label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                <button type="button" style={smallButton} onClick={() => addField(table.id!)}>
                  + Field
                </button>
              </article>
            ))}
          </div>

          <div
            style={{
              borderLeft: "1px solid var(--border)",
              display: "grid",
              gridTemplateRows: "auto 1fr",
              minHeight: 0,
            }}
          >
            <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
              Relationships
            </div>
            <div style={{ overflow: "auto", padding: 10, display: "grid", gap: 8 }}>
              {relationships.map((relation) => {
                const fromTable = tableById.get(relation.fromTableId);
                const toTable = tableById.get(relation.toTableId);
                return (
                  <div
                    key={relation.id}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: 8,
                      background: "var(--panel)",
                      display: "grid",
                      gap: 6,
                    }}
                  >
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                      <select
                        value={relation.fromTableId}
                        onChange={(event) =>
                          updateRelationship(relation.id, { fromTableId: event.target.value })
                        }
                        style={inputStyle}
                      >
                        {tables.map((table) => (
                          <option key={table.id} value={table.id}>
                            {table.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={relation.toTableId}
                        onChange={(event) =>
                          updateRelationship(relation.id, { toTableId: event.target.value })
                        }
                        style={inputStyle}
                      >
                        {tables.map((table) => (
                          <option key={table.id} value={table.id}>
                            {table.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                      <select
                        value={relation.fromFieldId || ""}
                        onChange={(event) =>
                          updateRelationship(relation.id, {
                            fromFieldId: event.target.value || undefined,
                          })
                        }
                        style={inputStyle}
                      >
                        <option value="">from field</option>
                        {(fromTable?.fields || []).map((field) => (
                          <option key={field.id} value={field.id}>
                            {field.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={relation.toFieldId || ""}
                        onChange={(event) =>
                          updateRelationship(relation.id, {
                            toFieldId: event.target.value || undefined,
                          })
                        }
                        style={inputStyle}
                      >
                        <option value="">to field</option>
                        {(toTable?.fields || []).map((field) => (
                          <option key={field.id} value={field.id}>
                            {field.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 6 }}>
                      <select
                        value={relation.type}
                        onChange={(event) =>
                          updateRelationship(relation.id, {
                            type: event.target.value as DatabaseRelationType,
                          })
                        }
                        style={inputStyle}
                      >
                        {relationTypes.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                      <select
                        value={relation.onDelete}
                        onChange={(event) =>
                          updateRelationship(relation.id, {
                            onDelete: event.target.value as DatabaseRelationship["onDelete"],
                          })
                        }
                        style={inputStyle}
                      >
                        <option value="no_action">no_action</option>
                        <option value="cascade">cascade</option>
                        <option value="restrict">restrict</option>
                        <option value="set_null">set_null</option>
                      </select>
                      <button
                        type="button"
                        style={smallButton}
                        onClick={() => removeRelationship(relation.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}

              <div
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  background: "var(--panel)",
                  padding: 10,
                  minHeight: 180,
                  position: "relative",
                }}
              >
                <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8 }}>
                  Relationship Map
                </div>
                <svg
                  width="100%"
                  height="170"
                  viewBox="0 0 820 170"
                  preserveAspectRatio="none"
                  style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
                >
                  {relationships.map((relation) => {
                    const from = pointByTableId.get(relation.fromTableId);
                    const to = pointByTableId.get(relation.toTableId);
                    if (!from || !to) return null;
                    return (
                      <line
                        key={relation.id}
                        x1={from.x + 55}
                        y1={from.y + 18}
                        x2={to.x - 55}
                        y2={to.y + 18}
                        stroke="color-mix(in srgb, var(--primary) 70%, var(--secondary) 30%)"
                        strokeWidth="2"
                        strokeDasharray={relation.type === "many_to_many" ? "5 5" : "0"}
                      />
                    );
                  })}
                </svg>
                {graphLayout.map((table) => (
                  <div
                    key={table.id}
                    style={{
                      position: "absolute",
                      left: table.x - 55,
                      top: table.y,
                      width: 110,
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      background: "var(--floating)",
                      textAlign: "center",
                      padding: "6px 8px",
                      fontSize: 11,
                      color: "var(--foreground)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {table.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ borderLeft: "1px solid var(--border)", display: "grid", gridTemplateRows: "1fr 1fr", minHeight: 0 }}>
        <div style={{ display: "grid", gridTemplateRows: "auto 1fr", minHeight: 0 }}>
          <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
            Prisma Schema
          </div>
          <textarea
            readOnly
            value={prismaSchema}
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              outline: "none",
              resize: "none",
              background: "transparent",
              color: "var(--secondary)",
              padding: 12,
              fontSize: 11,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}
          />
        </div>
        <div style={{ display: "grid", gridTemplateRows: "auto 1fr", minHeight: 0, borderTop: "1px solid var(--border)" }}>
          <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
            Migration SQL
          </div>
          <textarea
            readOnly
            value={migrationSql}
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              outline: "none",
              resize: "none",
              background: "transparent",
              color: "var(--secondary)",
              padding: 12,
              fontSize: 11,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}
          />
        </div>
      </div>
    </section>
  );
}
