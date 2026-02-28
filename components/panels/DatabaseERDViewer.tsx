"use client";

import React, { useMemo, useState } from "react";
import { DatabaseRelationship, DatabaseTable } from "@/lib/schema/node";

type DatabaseERDViewerProps = {
  tables: DatabaseTable[];
  relationships: DatabaseRelationship[];
};

const TABLE_WIDTH = 180;
const TABLE_HEIGHT = 60;
const COLS = 3;

const relationColors: Record<DatabaseRelationship["type"], string> = {
  one_to_one: "#60a5fa",
  one_to_many: "#4ade80",
  many_to_many: "#a78bfa",
};

export function DatabaseERDViewer({
  tables,
  relationships,
}: DatabaseERDViewerProps) {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });

  const layout = useMemo(() => {
    return tables.map((table, index) => {
      const col = index % COLS;
      const row = Math.floor(index / COLS);
      const x = col * (TABLE_WIDTH + 22) + 20;
      const y = row * (TABLE_HEIGHT + 18) + 18;
      return {
        id: table.id || table.name,
        name: table.name,
        fieldCount: (table.fields || []).length,
        x,
        y,
      };
    });
  }, [tables]);

  const indexById = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    layout.forEach((item) => map.set(item.id, { x: item.x, y: item.y }));
    layout.forEach((item) => map.set(item.name, { x: item.x, y: item.y }));
    return map;
  }, [layout]);

  const diagramHeight = Math.max(300, Math.ceil(layout.length / COLS) * 90 + 70);

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 6,
        background: "#111114",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "6px 8px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase" }}>
          ERD View
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            type="button"
            onClick={() => setScale((prev) => Math.max(0.6, Number((prev - 0.1).toFixed(2))))}
            style={{
              border: "1px solid var(--border)",
              background: "#15151a",
              color: "var(--foreground)",
              borderRadius: 4,
              padding: "2px 6px",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            -
          </button>
          <button
            type="button"
            onClick={() => setScale((prev) => Math.min(1.6, Number((prev + 0.1).toFixed(2))))}
            style={{
              border: "1px solid var(--border)",
              background: "#15151a",
              color: "var(--foreground)",
              borderRadius: 4,
              padding: "2px 6px",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setTranslate({ x: translate.x - 20, y: translate.y })}
            style={{
              border: "1px solid var(--border)",
              background: "#15151a",
              color: "var(--foreground)",
              borderRadius: 4,
              padding: "2px 6px",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => setTranslate({ x: translate.x + 20, y: translate.y })}
            style={{
              border: "1px solid var(--border)",
              background: "#15151a",
              color: "var(--foreground)",
              borderRadius: 4,
              padding: "2px 6px",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            →
          </button>
          <button
            type="button"
            onClick={() => setTranslate({ x: translate.x, y: translate.y - 20 })}
            style={{
              border: "1px solid var(--border)",
              background: "#15151a",
              color: "var(--foreground)",
              borderRadius: 4,
              padding: "2px 6px",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => setTranslate({ x: translate.x, y: translate.y + 20 })}
            style={{
              border: "1px solid var(--border)",
              background: "#15151a",
              color: "var(--foreground)",
              borderRadius: 4,
              padding: "2px 6px",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            ↓
          </button>
          <button
            type="button"
            onClick={() => {
              setScale(1);
              setTranslate({ x: 0, y: 0 });
            }}
            style={{
              border: "1px solid var(--border)",
              background: "#15151a",
              color: "var(--foreground)",
              borderRadius: 4,
              padding: "2px 6px",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            reset
          </button>
        </div>
      </div>

      <div
        style={{
          position: "relative",
          height: 340,
          overflow: "hidden",
          background: "#111114",
        }}
      >
        <div
          style={{
            position: "relative",
            width: 760,
            height: diagramHeight,
            transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          <svg
            width={760}
            height={diagramHeight}
            style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
          >
            {relationships.map((relationship, index) => {
              const from = indexById.get(relationship.fromTableId);
              const to = indexById.get(relationship.toTableId);
              if (!from || !to) return null;
              const x1 = from.x + TABLE_WIDTH / 2;
              const y1 = from.y + TABLE_HEIGHT / 2;
              const x2 = to.x + TABLE_WIDTH / 2;
              const y2 = to.y + TABLE_HEIGHT / 2;
              return (
                <line
                  key={`${relationship.id}-${index}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={relationColors[relationship.type] || "var(--muted)"}
                  strokeWidth={1.4}
                  strokeDasharray={
                    relationship.type === "many_to_many" ? "4 3" : undefined
                  }
                  opacity={0.9}
                />
              );
            })}
          </svg>

          {layout.map((table) => (
            <div
              key={table.id}
              style={{
                position: "absolute",
                left: table.x,
                top: table.y,
                width: TABLE_WIDTH,
                height: TABLE_HEIGHT,
                border: "1px solid var(--border)",
                borderRadius: 6,
                background: "#15151a",
                padding: "7px 8px",
                display: "grid",
                alignContent: "center",
                gap: 4,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: "var(--foreground)",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                }}
              >
                {table.name}
              </div>
              <div style={{ fontSize: 10, color: "var(--muted)" }}>
                {table.fieldCount} fields
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

