"use client";

import React, { useEffect, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import type {
  DatabaseTable,
  DatabaseTableField,
  DatabaseRelationship,
  DatabaseFieldType,
  DatabaseRelationType,
  NodeData,
} from "@/lib/schema/node";
import type { Node as RFNode } from "@xyflow/react";

// ─────────────────────────────────────────────────────────────────────────────
// Style tokens (matches GenCodeModal palette)
// ─────────────────────────────────────────────────────────────────────────────

const C = {
  panel:   "#151b24",
  float:   "#1a2230",
  border:  "#1e2836",
  fg:      "#eef2f8",
  muted:   "#6b7a99",
  primary: "#87a3ff",
  green:   "#22c55e",
  amber:   "#f59e0b",
  red:     "#ef4444",
  input:   "#0f151e",
};

const FIELD_TYPES: DatabaseFieldType[] = [
  "string", "number", "date", "text", "int", "bigint",
  "float", "decimal", "boolean", "datetime", "json", "uuid",
];

const RELATION_TYPES: DatabaseRelationType[] = [
  "one_to_one", "one_to_many", "many_to_many",
];

const ON_DELETE_OPTIONS = ["cascade", "restrict", "set_null", "no_action"] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const mkId = () => Math.random().toString(36).slice(2);

const defaultPkField = (): DatabaseTableField => ({
  id: mkId(),
  name: "id",
  type: "uuid",
  isPrimaryKey: true,
  nullable: false,
});

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface ApiTableModalProps {
  nodeId: string;
  onClose: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal
// ─────────────────────────────────────────────────────────────────────────────

export function ApiTableModal({ nodeId, onClose }: ApiTableModalProps) {
  const updateNodeData = useStore((s) => s.updateNodeData);
  const pushTablesToDb = useStore((s) => s.pushTablesToDb);
  const graphs = useStore((s) => s.graphs);

  // Read initial data from the node
  const apiNodes = graphs.api.nodes;
  const thisNode = apiNodes.find((n) => n.id === nodeId);
  const nodeData = thisNode?.data as (NodeData & { kind: "api_binding" }) | undefined;

  const [tables, setTables] = useState<DatabaseTable[]>(() =>
    (nodeData?.kind === "api_binding" ? nodeData.tables ?? [] : []),
  );
  const [relationships, setRelationships] = useState<DatabaseRelationship[]>(() =>
    (nodeData?.kind === "api_binding" ? nodeData.tableRelationships ?? [] : []),
  );
  const [selectedTableId, setSelectedTableId] = useState<string | null>(
    () => tables[0]?.id ?? null,
  );
  const [pushDropdownOpen, setPushDropdownOpen] = useState(false);
  const pushBtnRef = useRef<HTMLButtonElement>(null);

  // Database nodes for the "Push to DB" dropdown
  const dbNodes = graphs.database.nodes as RFNode[];
  const dbNodeOptions = dbNodes
    .map((n) => {
      const d = n.data as NodeData & { kind?: string; label?: string };
      if (d.kind !== "database") return null;
      return { id: n.id, label: (d as { label: string }).label || n.id };
    })
    .filter(Boolean) as { id: string; label: string }[];

  const selectedTable = tables.find((t) => t.id === selectedTableId) ?? null;

  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // Close push dropdown on outside click
  useEffect(() => {
    if (!pushDropdownOpen) return;
    const h = (e: MouseEvent) => {
      if (pushBtnRef.current && !pushBtnRef.current.parentElement?.contains(e.target as Element)) {
        setPushDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [pushDropdownOpen]);

  // ── Table list actions ────────────────────────────────────────────────────

  const addTable = () => {
    const id = mkId();
    const newTable: DatabaseTable = {
      id,
      name: `table_${tables.length + 1}`,
      fields: [defaultPkField()],
    };
    setTables((prev) => [...prev, newTable]);
    setSelectedTableId(id);
  };

  const removeTable = (id: string) => {
    setTables((prev) => prev.filter((t) => t.id !== id));
    setSelectedTableId((prev) => {
      if (prev !== id) return prev;
      const remaining = tables.filter((t) => t.id !== id);
      return remaining[0]?.id ?? null;
    });
    // Remove any relationships referencing this table
    setRelationships((prev) =>
      prev.filter((r) => r.fromTableId !== id && r.toTableId !== id),
    );
  };

  const updateTableName = (id: string, name: string) => {
    setTables((prev) => prev.map((t) => (t.id === id ? { ...t, name } : t)));
  };

  // ── Column actions ────────────────────────────────────────────────────────

  const addField = (tableId: string) => {
    const field: DatabaseTableField = {
      id: mkId(),
      name: `field_${(selectedTable?.fields.length ?? 0) + 1}`,
      type: "string",
      nullable: true,
    };
    setTables((prev) =>
      prev.map((t) =>
        t.id === tableId ? { ...t, fields: [...t.fields, field] } : t,
      ),
    );
  };

  const updateField = (
    tableId: string,
    fieldId: string,
    patch: Partial<DatabaseTableField>,
  ) => {
    setTables((prev) =>
      prev.map((t) => {
        if (t.id !== tableId) return t;
        return {
          ...t,
          fields: t.fields.map((f) =>
            f.id === fieldId ? { ...f, ...patch } : f,
          ),
        };
      }),
    );
  };

  const removeField = (tableId: string, fieldId: string) => {
    setTables((prev) =>
      prev.map((t) => {
        if (t.id !== tableId) return t;
        return { ...t, fields: t.fields.filter((f) => f.id !== fieldId) };
      }),
    );
  };

  // ── Relation actions ──────────────────────────────────────────────────────

  const addRelation = () => {
    if (tables.length < 2) return;
    const rel: DatabaseRelationship = {
      id: mkId(),
      type: "one_to_many",
      fromTableId: tables[0].id ?? "",
      toTableId: tables[1].id ?? "",
      onDelete: "no_action",
    };
    setRelationships((prev) => [...prev, rel]);
  };

  const updateRelation = (
    relId: string,
    patch: Partial<DatabaseRelationship>,
  ) => {
    setRelationships((prev) =>
      prev.map((r) => (r.id === relId ? { ...r, ...patch } : r)),
    );
  };

  const removeRelation = (relId: string) => {
    setRelationships((prev) => prev.filter((r) => r.id !== relId));
  };

  // ── Footer actions ────────────────────────────────────────────────────────

  const handleSave = () => {
    updateNodeData(nodeId, {
      tables,
      tableRelationships: relationships,
    } as Partial<NodeData>);
    onClose();
  };

  const handlePushToDb = (dbNodeId: string) => {
    setPushDropdownOpen(false);
    pushTablesToDb(dbNodeId, tables, relationships);
    updateNodeData(nodeId, { linkedDbNodeId: dbNodeId } as Partial<NodeData>);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.72)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.panel,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          width: "100%",
          maxWidth: 900,
          height: "80vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
        }}
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 20px",
            borderBottom: `1px solid ${C.border}`,
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 700, color: C.fg }}>
            Data Tables
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: C.muted,
              cursor: "pointer",
              fontSize: 17,
              padding: "2px 4px",
            }}
          >
            ✕
          </button>
        </div>

        {/* ── Body ────────────────────────────────────────────────────── */}
        <div
          style={{
            flex: 1,
            display: "flex",
            overflow: "hidden",
            minHeight: 0,
          }}
        >
          {/* LEFT: table list */}
          <div
            style={{
              width: 200,
              flexShrink: 0,
              borderRight: `1px solid ${C.border}`,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "10px 12px",
                fontSize: 10,
                fontWeight: 700,
                color: C.muted,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                borderBottom: `1px solid ${C.border}`,
              }}
            >
              Tables
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
              {tables.map((t) => (
                <div
                  key={t.id}
                  onClick={() => setSelectedTableId(t.id ?? null)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "7px 12px",
                    cursor: "pointer",
                    background:
                      selectedTableId === t.id
                        ? `color-mix(in srgb, ${C.primary} 12%, ${C.float})`
                        : "transparent",
                    borderLeft:
                      selectedTableId === t.id
                        ? `2px solid ${C.primary}`
                        : "2px solid transparent",
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      color: selectedTableId === t.id ? C.fg : C.muted,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {t.name}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeTable(t.id ?? "");
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: C.muted,
                      cursor: "pointer",
                      fontSize: 12,
                      padding: "0 2px",
                      flexShrink: 0,
                    }}
                    title="Remove table"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <div style={{ padding: "8px 12px", borderTop: `1px solid ${C.border}` }}>
              <button
                type="button"
                onClick={addTable}
                style={{
                  width: "100%",
                  background: C.float,
                  border: `1px solid ${C.border}`,
                  color: C.primary,
                  borderRadius: 7,
                  padding: "6px 0",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                + Add Table
              </button>
            </div>
          </div>

          {/* CENTER: column editor */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              minWidth: 0,
            }}
          >
            {selectedTable ? (
              <>
                {/* Table name header */}
                <div
                  style={{
                    padding: "10px 16px",
                    borderBottom: `1px solid ${C.border}`,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flexShrink: 0,
                  }}
                >
                  <span style={{ fontSize: 11, color: C.muted, flexShrink: 0 }}>
                    Table name:
                  </span>
                  <input
                    value={selectedTable.name}
                    onChange={(e) =>
                      updateTableName(selectedTable.id ?? "", e.target.value)
                    }
                    style={{
                      background: C.input,
                      border: `1px solid ${C.border}`,
                      borderRadius: 6,
                      color: C.fg,
                      fontSize: 13,
                      fontWeight: 600,
                      padding: "4px 10px",
                      outline: "none",
                      flex: 1,
                      maxWidth: 240,
                    }}
                  />
                </div>

                {/* Column rows */}
                <div style={{ flex: 1, overflowY: "auto", padding: "10px 16px" }}>
                  {/* Column header row */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 110px 36px 36px 36px 36px 90px 28px",
                      gap: 6,
                      alignItems: "center",
                      marginBottom: 6,
                    }}
                  >
                    {["Name", "Type", "PK", "FK", "Null", "Uniq", "Default", ""].map((h) => (
                      <span
                        key={h}
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          color: C.muted,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          textAlign: h === "PK" || h === "FK" || h === "Null" || h === "Uniq" ? "center" : "left",
                        }}
                      >
                        {h}
                      </span>
                    ))}
                  </div>

                  {selectedTable.fields.map((field) => (
                    <FieldRow
                      key={field.id}
                      field={field}
                      allTables={tables}
                      currentTableId={selectedTable.id ?? ""}
                      onChange={(patch) =>
                        updateField(selectedTable.id ?? "", field.id ?? "", patch)
                      }
                      onRemove={() =>
                        removeField(selectedTable.id ?? "", field.id ?? "")
                      }
                    />
                  ))}

                  <button
                    type="button"
                    onClick={() => addField(selectedTable.id ?? "")}
                    style={{
                      marginTop: 8,
                      background: C.float,
                      border: `1px dashed ${C.border}`,
                      color: C.muted,
                      borderRadius: 7,
                      padding: "6px 14px",
                      fontSize: 12,
                      cursor: "pointer",
                      width: "100%",
                    }}
                  >
                    + Add Column
                  </button>

                  {/* Relations section */}
                  <div
                    style={{
                      marginTop: 20,
                      paddingTop: 14,
                      borderTop: `1px solid ${C.border}`,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 10,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: C.muted,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                        }}
                      >
                        Relationships
                      </span>
                      <button
                        type="button"
                        onClick={addRelation}
                        disabled={tables.length < 2}
                        style={{
                          background: C.float,
                          border: `1px solid ${C.border}`,
                          color: tables.length < 2 ? C.muted : C.primary,
                          borderRadius: 6,
                          padding: "3px 10px",
                          fontSize: 11,
                          cursor: tables.length < 2 ? "not-allowed" : "pointer",
                          opacity: tables.length < 2 ? 0.5 : 1,
                        }}
                      >
                        + Add
                      </button>
                    </div>

                    {relationships.length === 0 ? (
                      <span style={{ fontSize: 11, color: C.muted }}>
                        No relationships defined. Add at least 2 tables to create one.
                      </span>
                    ) : (
                      relationships.map((rel) => (
                        <RelationRow
                          key={rel.id}
                          relation={rel}
                          tables={tables}
                          onChange={(patch) => updateRelation(rel.id, patch)}
                          onRemove={() => removeRelation(rel.id)}
                        />
                      ))
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: C.muted,
                  fontSize: 13,
                }}
              >
                {tables.length === 0
                  ? "Click \"+ Add Table\" to get started"
                  : "Select a table to edit its columns"}
              </div>
            )}
          </div>
        </div>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 9,
            padding: "13px 20px",
            borderTop: `1px solid ${C.border}`,
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              background: C.float,
              border: `1px solid ${C.border}`,
              color: C.fg,
              borderRadius: 8,
              padding: "7px 16px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>

          {/* Push to DB button + dropdown */}
          <div style={{ position: "relative" }}>
            <button
              ref={pushBtnRef}
              type="button"
              onClick={() => setPushDropdownOpen((v) => !v)}
              disabled={dbNodeOptions.length === 0}
              style={{
                background: C.float,
                border: `1px solid ${C.border}`,
                color: dbNodeOptions.length === 0 ? C.muted : C.amber,
                borderRadius: 8,
                padding: "7px 14px",
                fontSize: 12,
                fontWeight: 600,
                cursor: dbNodeOptions.length === 0 ? "not-allowed" : "pointer",
                opacity: dbNodeOptions.length === 0 ? 0.5 : 1,
              }}
              title={
                dbNodeOptions.length === 0
                  ? "No DatabaseNode found in the Database tab"
                  : "Push tables to a DatabaseNode"
              }
            >
              Push to DB ▾
            </button>
            {pushDropdownOpen && (
              <div
                style={{
                  position: "absolute",
                  bottom: "calc(100% + 6px)",
                  right: 0,
                  background: C.float,
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  minWidth: 180,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                  zIndex: 10,
                  overflow: "hidden",
                }}
              >
                {dbNodeOptions.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handlePushToDb(opt.id)}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      background: "none",
                      border: "none",
                      color: C.fg,
                      fontSize: 12,
                      padding: "9px 14px",
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background =
                        `color-mix(in srgb, ${C.primary} 10%, ${C.float})`;
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = "none";
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleSave}
            style={{
              background: `color-mix(in srgb, ${C.primary} 22%, ${C.float})`,
              border: `1px solid ${C.primary}`,
              color: C.primary,
              borderRadius: 8,
              padding: "7px 20px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FieldRow sub-component
// ─────────────────────────────────────────────────────────────────────────────

interface FieldRowProps {
  field: DatabaseTableField;
  allTables: DatabaseTable[];
  currentTableId: string;
  onChange: (patch: Partial<DatabaseTableField>) => void;
  onRemove: () => void;
}

function FieldRow({ field, allTables, onChange, onRemove }: FieldRowProps) {
  const [showFkPicker, setShowFkPicker] = useState(Boolean(field.isForeignKey));

  const otherTables = allTables.filter((t) => true); // all tables available as FK target

  const inputStyle: React.CSSProperties = {
    background: C.input,
    border: `1px solid ${C.border}`,
    borderRadius: 5,
    color: C.fg,
    fontSize: 11,
    padding: "3px 6px",
    width: "100%",
    outline: "none",
  };

  const checkStyle = (active: boolean): React.CSSProperties => ({
    width: 16,
    height: 16,
    borderRadius: 4,
    border: `1px solid ${active ? C.primary : C.border}`,
    background: active ? `color-mix(in srgb, ${C.primary} 20%, ${C.float})` : C.float,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    margin: "0 auto",
  });

  return (
    <div style={{ marginBottom: showFkPicker ? 8 : 4 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 110px 36px 36px 36px 36px 90px 28px",
          gap: 6,
          alignItems: "center",
        }}
      >
        {/* Name */}
        <input
          value={field.name}
          onChange={(e) => onChange({ name: e.target.value })}
          style={inputStyle}
          placeholder="field_name"
        />

        {/* Type */}
        <select
          value={field.type}
          onChange={(e) => onChange({ type: e.target.value as DatabaseFieldType })}
          style={{ ...inputStyle, cursor: "pointer" }}
        >
          {FIELD_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        {/* PK */}
        <div
          style={checkStyle(Boolean(field.isPrimaryKey))}
          onClick={() => onChange({ isPrimaryKey: !field.isPrimaryKey })}
          title="Primary Key"
        >
          {field.isPrimaryKey && (
            <span style={{ fontSize: 9, color: C.primary }}>✓</span>
          )}
        </div>

        {/* FK */}
        <div
          style={checkStyle(Boolean(field.isForeignKey))}
          onClick={() => {
            const next = !field.isForeignKey;
            onChange({ isForeignKey: next, references: next ? field.references : undefined });
            setShowFkPicker(next);
          }}
          title="Foreign Key"
        >
          {field.isForeignKey && (
            <span style={{ fontSize: 9, color: C.primary }}>✓</span>
          )}
        </div>

        {/* Nullable */}
        <div
          style={checkStyle(Boolean(field.nullable))}
          onClick={() => onChange({ nullable: !field.nullable })}
          title="Nullable"
        >
          {field.nullable && (
            <span style={{ fontSize: 9, color: C.primary }}>✓</span>
          )}
        </div>

        {/* Unique */}
        <div
          style={checkStyle(Boolean(field.unique))}
          onClick={() => onChange({ unique: !field.unique })}
          title="Unique"
        >
          {field.unique && (
            <span style={{ fontSize: 9, color: C.primary }}>✓</span>
          )}
        </div>

        {/* Default */}
        <input
          value={field.defaultValue ?? ""}
          onChange={(e) => onChange({ defaultValue: e.target.value || undefined })}
          style={inputStyle}
          placeholder="default"
        />

        {/* Remove */}
        <button
          type="button"
          onClick={onRemove}
          style={{
            background: "none",
            border: "none",
            color: C.muted,
            cursor: "pointer",
            fontSize: 13,
            padding: "0 4px",
          }}
          title="Remove field"
        >
          ✕
        </button>
      </div>

      {/* FK reference picker */}
      {showFkPicker && field.isForeignKey && (
        <div
          style={{
            marginTop: 4,
            marginLeft: 8,
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11,
            color: C.muted,
          }}
        >
          <span>→ references</span>
          <select
            value={field.references?.table ?? ""}
            onChange={(e) =>
              onChange({
                references: { table: e.target.value, field: field.references?.field ?? "" },
              })
            }
            style={{
              background: C.input,
              border: `1px solid ${C.border}`,
              borderRadius: 5,
              color: C.fg,
              fontSize: 11,
              padding: "2px 6px",
              outline: "none",
            }}
          >
            <option value="">— table —</option>
            {otherTables.map((t) => (
              <option key={t.id} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
          <span>.</span>
          <select
            value={field.references?.field ?? ""}
            onChange={(e) =>
              onChange({
                references: { table: field.references?.table ?? "", field: e.target.value },
              })
            }
            style={{
              background: C.input,
              border: `1px solid ${C.border}`,
              borderRadius: 5,
              color: C.fg,
              fontSize: 11,
              padding: "2px 6px",
              outline: "none",
            }}
          >
            <option value="">— field —</option>
            {otherTables
              .find((t) => t.name === field.references?.table)
              ?.fields.map((f) => (
                <option key={f.id} value={f.name}>
                  {f.name}
                </option>
              ))}
          </select>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RelationRow sub-component
// ─────────────────────────────────────────────────────────────────────────────

interface RelationRowProps {
  relation: DatabaseRelationship;
  tables: DatabaseTable[];
  onChange: (patch: Partial<DatabaseRelationship>) => void;
  onRemove: () => void;
}

function RelationRow({ relation, tables, onChange, onRemove }: RelationRowProps) {
  const selectStyle: React.CSSProperties = {
    background: C.input,
    border: `1px solid ${C.border}`,
    borderRadius: 5,
    color: C.fg,
    fontSize: 11,
    padding: "3px 6px",
    outline: "none",
    cursor: "pointer",
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        marginBottom: 6,
        flexWrap: "wrap",
      }}
    >
      <select
        value={relation.fromTableId}
        onChange={(e) => onChange({ fromTableId: e.target.value })}
        style={selectStyle}
      >
        {tables.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>

      <select
        value={relation.type}
        onChange={(e) => onChange({ type: e.target.value as DatabaseRelationType })}
        style={selectStyle}
      >
        {RELATION_TYPES.map((rt) => (
          <option key={rt} value={rt}>
            {rt}
          </option>
        ))}
      </select>

      <select
        value={relation.toTableId}
        onChange={(e) => onChange({ toTableId: e.target.value })}
        style={selectStyle}
      >
        {tables.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>

      <span style={{ fontSize: 10, color: C.muted }}>onDelete:</span>
      <select
        value={relation.onDelete}
        onChange={(e) =>
          onChange({
            onDelete: e.target.value as DatabaseRelationship["onDelete"],
          })
        }
        style={selectStyle}
      >
        {ON_DELETE_OPTIONS.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={onRemove}
        style={{
          background: "none",
          border: "none",
          color: C.muted,
          cursor: "pointer",
          fontSize: 13,
          padding: "0 4px",
        }}
        title="Remove relationship"
      >
        ✕
      </button>
    </div>
  );
}
