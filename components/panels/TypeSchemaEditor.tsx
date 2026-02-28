"use client";

import React, { useState } from "react";
import { NestedProperty } from "@/lib/schema/node";

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--background)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  padding: "4px 6px",
  fontSize: 11,
  color: "var(--foreground)",
  outline: "none",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: "pointer",
};

const labelStyle: React.CSSProperties = {
  fontSize: 9,
  color: "var(--muted)",
  textTransform: "uppercase",
  marginBottom: 2,
};

interface TypeSchemaEditorProps {
  field: {
    name: string;
    type: "string" | "number" | "boolean" | "object" | "array" | "any";
    required?: boolean;
    description?: string;
    properties?: NestedProperty[];
    items?: NestedProperty;
    format?: "email" | "uri" | "date" | "date-time" | "uuid" | "regex";
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
  };
  onChange: (field: TypeSchemaEditorProps["field"]) => void;
  onRemove?: () => void;
  depth?: number;
}

export function TypeSchemaEditor({
  field,
  onChange,
  onRemove,
  depth = 0,
}: TypeSchemaEditorProps) {
  const [expanded, setExpanded] = useState(depth === 0);
  const [newPropName, setNewPropName] = useState("");

  const bgColor = depth % 2 === 0 ? "var(--background)" : "var(--floating)";

  const addProperty = () => {
    if (!newPropName.trim()) return;
    const newProp: NestedProperty = {
      name: newPropName.trim(),
      type: "string",
      required: true,
    };
    onChange({
      ...field,
      properties: [...(field.properties || []), newProp],
    });
    setNewPropName("");
  };

  const updateProperty = (index: number, updated: NestedProperty) => {
    const props = [...(field.properties || [])];
    props[index] = updated;
    onChange({ ...field, properties: props });
  };

  const removeProperty = (index: number) => {
    const props = (field.properties || []).filter((_, i) => i !== index);
    onChange({ ...field, properties: props });
  };

  const updateItems = (items: NestedProperty) => {
    onChange({ ...field, items });
  };

  return (
    <div
      style={{
        background: bgColor,
        border: "1px solid var(--border)",
        borderRadius: 4,
        padding: 8,
        marginBottom: 4,
      }}
    >
      {/* Header Row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 6,
        }}
      >
        {(field.type === "object" || field.type === "array") && (
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--muted)",
              cursor: "pointer",
              fontSize: 10,
              padding: 0,
            }}
          >
            {expanded ? "▼" : "▶"}
          </button>
        )}

        {/* Field Name */}
        <input
          type="text"
          value={field.name}
          onChange={(e) => onChange({ ...field, name: e.target.value })}
          placeholder="field name"
          style={{ ...inputStyle, flex: 1 }}
        />

        {/* Type Selector */}
        <select
          value={field.type}
          onChange={(e) =>
            onChange({
              ...field,
              type: e.target.value as NestedProperty["type"],
              properties: e.target.value === "object" ? [] : undefined,
              items:
                e.target.value === "array"
                  ? { name: "item", type: "string" }
                  : undefined,
            })
          }
          style={{ ...selectStyle, width: 80 }}
        >
          <option value="string">string</option>
          <option value="number">number</option>
          <option value="boolean">boolean</option>
          <option value="object">object</option>
          <option value="array">array</option>
          <option value="any">any</option>
        </select>

        {/* Required Toggle */}
        {field.required !== undefined && (
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 3,
              fontSize: 9,
              color: field.required ? "#ef4444" : "var(--muted)",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={field.required}
              onChange={(e) =>
                onChange({ ...field, required: e.target.checked })
              }
              style={{ width: 12, height: 12 }}
            />
            req
          </label>
        )}

        {/* Remove Button */}
        {onRemove && (
          <button
            onClick={onRemove}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--muted)",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div style={{ marginLeft: 12, marginTop: 8 }}>
          {/* String Options */}
          {field.type === "string" && (
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>Format</div>
                <select
                  value={field.format || ""}
                  onChange={(e) =>
                    onChange({
                      ...field,
                      format:
                        (e.target.value as NestedProperty["format"]) ||
                        undefined,
                    })
                  }
                  style={selectStyle}
                >
                  <option value="">none</option>
                  <option value="email">email</option>
                  <option value="uri">uri</option>
                  <option value="date">date</option>
                  <option value="date-time">date-time</option>
                  <option value="uuid">uuid</option>
                  <option value="regex">regex</option>
                </select>
              </div>
              <div style={{ width: 50 }}>
                <div style={labelStyle}>Min Len</div>
                <input
                  type="number"
                  value={field.minLength ?? ""}
                  onChange={(e) =>
                    onChange({
                      ...field,
                      minLength: e.target.value
                        ? parseInt(e.target.value)
                        : undefined,
                    })
                  }
                  style={inputStyle}
                />
              </div>
              <div style={{ width: 50 }}>
                <div style={labelStyle}>Max Len</div>
                <input
                  type="number"
                  value={field.maxLength ?? ""}
                  onChange={(e) =>
                    onChange({
                      ...field,
                      maxLength: e.target.value
                        ? parseInt(e.target.value)
                        : undefined,
                    })
                  }
                  style={inputStyle}
                />
              </div>
            </div>
          )}

          {/* Number Options */}
          {field.type === "number" && (
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>Minimum</div>
                <input
                  type="number"
                  value={field.minimum ?? ""}
                  onChange={(e) =>
                    onChange({
                      ...field,
                      minimum: e.target.value
                        ? parseFloat(e.target.value)
                        : undefined,
                    })
                  }
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>Maximum</div>
                <input
                  type="number"
                  value={field.maximum ?? ""}
                  onChange={(e) =>
                    onChange({
                      ...field,
                      maximum: e.target.value
                        ? parseFloat(e.target.value)
                        : undefined,
                    })
                  }
                  style={inputStyle}
                />
              </div>
            </div>
          )}

          {/* Object Properties */}
          {field.type === "object" && (
            <div>
              <div style={{ ...labelStyle, marginBottom: 6 }}>Properties</div>
              {(field.properties || []).map((prop, i) => (
                <TypeSchemaEditor
                  key={i}
                  field={prop}
                  onChange={(updated) => updateProperty(i, updated)}
                  onRemove={() => removeProperty(i)}
                  depth={depth + 1}
                />
              ))}
              <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                <input
                  type="text"
                  value={newPropName}
                  onChange={(e) => setNewPropName(e.target.value)}
                  placeholder="property name"
                  style={{ ...inputStyle, flex: 1 }}
                  onKeyDown={(e) => e.key === "Enter" && addProperty()}
                />
                <button
                  onClick={addProperty}
                  style={{
                    background: "var(--primary)",
                    border: "none",
                    borderRadius: 4,
                    padding: "4px 8px",
                    color: "white",
                    fontSize: 10,
                    cursor: "pointer",
                  }}
                >
                  +
                </button>
              </div>
            </div>
          )}

          {/* Array Items */}
          {field.type === "array" && field.items && (
            <div>
              <div style={{ ...labelStyle, marginBottom: 6 }}>
                Array Item Type
              </div>
              <TypeSchemaEditor
                field={field.items}
                onChange={updateItems}
                depth={depth + 1}
              />
            </div>
          )}

          {/* Description */}
          <div style={{ marginTop: 6 }}>
            <div style={labelStyle}>Description</div>
            <input
              type="text"
              value={field.description || ""}
              onChange={(e) =>
                onChange({ ...field, description: e.target.value })
              }
              placeholder="optional description"
              style={inputStyle}
            />
          </div>
        </div>
      )}
    </div>
  );
}
