"use client";

import React, { useEffect, useState } from "react";
import type { ValidationResult, ValidationIssue } from "@/lib/validate-architecture";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type Language = "javascript" | "python";

export interface GenCodeModalProps {
  /** Pre-computed result from validateArchitecture() */
  validationResult: ValidationResult;
  onConfirm: (language: Language) => void;
  onCancel: () => void;
  /**
   * Called when the user clicks a clickable error/warning row.
   * Closes the modal and selects + pans to the relevant node on the canvas.
   */
  onFocusNode?: (nodeId: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Style tokens
// ─────────────────────────────────────────────────────────────────────────────

const C = {
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

// ─────────────────────────────────────────────────────────────────────────────
// Language options
// ─────────────────────────────────────────────────────────────────────────────

const LANGUAGES: {
  id: Language;
  name: string;
  sub: string;
  icon: string;
  accent: string;
}[] = [
    { id: "javascript", name: "JavaScript", sub: "Node.js · TypeScript", icon: "JS", accent: "#f7df1e" },
    { id: "python", name: "Python", sub: "FastAPI · Pydantic", icon: "PY", accent: "#3b82f6" },
  ];

// ─────────────────────────────────────────────────────────────────────────────
// Issue row — clickable when it has a nodeId; has an inline AI hint button
// ─────────────────────────────────────────────────────────────────────────────

function IssueRow({
  issue,
  onFocusNode,
}: {
  issue: ValidationIssue;
  onFocusNode?: (id: string) => void;
}) {
  const [hint, setHint] = useState<string | null>(null);
  const [loadingHint, setLoadingHint] = useState(false);
  const [hintError, setHintError] = useState(false);

  const isErr = issue.severity === "error";
  const color = isErr ? C.red : C.amber;
  const canNavigate = !!issue.nodeId && !!onFocusNode;

  const handleRowClick = () => {
    if (canNavigate) onFocusNode!(issue.nodeId!);
  };

  const handleAiHint = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoadingHint(true);
    setHintError(false);
    try {
      const res = await fetch("/api/fix-hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: issue.title, detail: issue.detail }),
      });
      if (!res.ok) throw new Error("non-ok");
      const json = await res.json() as { hint?: string };
      setHint(json.hint || "No suggestion available.");
    } catch {
      setHintError(true);
      setHint("Could not load suggestion.");
    } finally {
      setLoadingHint(false);
    }
  };

  return (
    <div
      onClick={handleRowClick}
      title={canNavigate ? "Click to navigate to this block" : undefined}
      style={{
        display: "flex",
        gap: 9,
        alignItems: "flex-start",
        padding: "8px 11px",
        background: `color-mix(in srgb, ${color} 7%, ${C.panel})`,
        border: `1px solid color-mix(in srgb, ${color} 24%, transparent)`,
        borderRadius: 7,
        marginBottom: 5,
        cursor: canNavigate ? "pointer" : "default",
        transition: "background .12s, border-color .12s",
      }}
      onMouseEnter={(e) => {
        if (canNavigate)
          (e.currentTarget as HTMLDivElement).style.background =
            `color-mix(in srgb, ${color} 14%, ${C.panel})`;
      }}
      onMouseLeave={(e) => {
        if (canNavigate)
          (e.currentTarget as HTMLDivElement).style.background =
            `color-mix(in srgb, ${color} 7%, ${C.panel})`;
      }}
    >
      {/* severity icon */}
      <span style={{ fontSize: 12, color, flexShrink: 0, marginTop: 2 }}>
        {isErr ? "✕" : "⚠"}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* title row */}
        <div
          style={{
            fontSize: 12,
            color: C.fg,
            lineHeight: 1.5,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 8,
          }}
        >
          <span style={{ flex: 1 }}>{issue.title}</span>
          {canNavigate && (
            <span
              style={{
                fontSize: 10,
                color: C.primary,
                flexShrink: 0,
                marginTop: 2,
                whiteSpace: "nowrap",
              }}
            >
              → Go to block
            </span>
          )}
        </div>

        {/* detail */}
        {issue.detail && (
          <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
            → {issue.detail}
          </div>
        )}

        {/* AI hint section */}
        {hint ? (
          <div
            style={{
              marginTop: 5,
              padding: "5px 8px",
              background: `color-mix(in srgb, ${C.primary} 8%, ${C.panel})`,
              border: `1px solid color-mix(in srgb, ${C.primary} 20%, transparent)`,
              borderRadius: 5,
              fontSize: 11,
              color: hintError ? C.muted : C.primary,
              lineHeight: 1.5,
            }}
          >
            {hintError ? "⚠ " : "💡 "}{hint}
          </div>
        ) : (
          <button
            type="button"
            onClick={handleAiHint}
            disabled={loadingHint}
            style={{
              marginTop: 5,
              background: "none",
              border: `1px solid color-mix(in srgb, ${C.primary} 25%, transparent)`,
              borderRadius: 4,
              color: C.muted,
              cursor: loadingHint ? "default" : "pointer",
              fontSize: 10,
              padding: "2px 7px",
              opacity: loadingHint ? 0.6 : 1,
              transition: "color .15s, border-color .15s",
            }}
            onMouseEnter={(e) => {
              if (!loadingHint) {
                (e.currentTarget as HTMLButtonElement).style.color = C.primary;
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  `color-mix(in srgb, ${C.primary} 55%, transparent)`;
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = C.muted;
              (e.currentTarget as HTMLButtonElement).style.borderColor =
                `color-mix(in srgb, ${C.primary} 25%, transparent)`;
            }}
          >
            {loadingHint ? "Loading AI suggestion…" : "✦ Get AI fix suggestion"}
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal
// ─────────────────────────────────────────────────────────────────────────────

export function GenCodeModal({
  validationResult,
  onConfirm,
  onCancel,
  onFocusNode,
}: GenCodeModalProps) {
  const [lang, setLang] = useState<Language>("javascript");
  const [showWarnings, setShowWarnings] = useState(true);

  const { errors, warnings, ok } = validationResult;

  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onCancel]);

  const summaryColor = errors.length > 0 ? C.red : warnings.length > 0 ? C.amber : C.green;
  const summaryIcon = errors.length > 0 ? "✕" : warnings.length > 0 ? "⚠" : "✓";
  const summaryText = errors.length > 0
    ? `${errors.length} error${errors.length !== 1 ? "s" : ""} must be fixed before generating`
    : warnings.length > 0
      ? `${warnings.length} warning${warnings.length !== 1 ? "s" : ""} — you can still generate`
      : "Architecture looks good — ready to generate";

  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.68)",
        display: "grid", placeItems: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.panel,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          width: "100%", maxWidth: 520,
          maxHeight: "90vh",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 24px 64px rgba(0,0,0,0.55)",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "15px 20px",
          borderBottom: `1px solid ${C.border}`,
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: C.fg }}>Generate Code</span>
          <button type="button" onClick={onCancel}
            style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 17, padding: "2px 4px" }}>
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: "auto", flex: 1, padding: "18px 20px" }}>

          {/* Validation summary */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "9px 13px", borderRadius: 8, marginBottom: 16,
            background: `color-mix(in srgb, ${summaryColor} 10%, ${C.float})`,
            border: `1px solid color-mix(in srgb, ${summaryColor} 28%, transparent)`,
          }}>
            <span style={{ color: summaryColor, fontSize: 14 }}>{summaryIcon}</span>
            <span style={{ fontSize: 12, color: C.fg }}>{summaryText}</span>
          </div>

          {/* Errors */}
          {errors.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{
                fontSize: 10, fontWeight: 700, color: C.red,
                letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 7,
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <span>Errors — must fix ({errors.length})</span>
                {errors.some((e) => e.nodeId) && (
                  <span style={{ fontSize: 9, color: C.muted, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                    click an error to jump to it
                  </span>
                )}
              </div>
              {errors.map((i, idx) => (
                <IssueRow key={idx} issue={i} onFocusNode={onFocusNode} />
              ))}
            </div>
          )}

          {/* Warnings (collapsible) */}
          {warnings.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <button type="button" onClick={() => setShowWarnings((v) => !v)}
                style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, padding: 0, marginBottom: 7 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: C.amber, letterSpacing: "0.07em", textTransform: "uppercase" }}>
                  Warnings ({warnings.length})
                </span>
                <span style={{ fontSize: 11, color: C.muted }}>{showWarnings ? "▾" : "▸"}</span>
              </button>
              {showWarnings && warnings.map((i, idx) => (
                <IssueRow key={idx} issue={i} onFocusNode={onFocusNode} />
              ))}
            </div>
          )}

          {/* Language picker */}
          <div>
            <div style={{
              fontSize: 10, fontWeight: 700, color: C.muted,
              letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 10,
            }}>
              Target Language
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              {LANGUAGES.map((l) => {
                const active = lang === l.id;
                return (
                  <button key={l.id} type="button" onClick={() => setLang(l.id)} style={{
                    flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                    padding: "15px 10px",
                    background: active ? `color-mix(in srgb, ${l.accent} 10%, ${C.float})` : C.float,
                    border: `2px solid ${active ? l.accent : C.border}`,
                    borderRadius: 10, cursor: "pointer",
                    transition: "border-color .15s, background .15s",
                  }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: 34, height: 34, borderRadius: 7,
                      background: `color-mix(in srgb, ${l.accent} 18%, ${C.panel})`,
                      fontSize: 11, fontWeight: 900, color: l.accent,
                    }}>
                      {l.icon}
                    </span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: active ? C.fg : "#9aaccc" }}>{l.name}</div>
                      <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{l.sub}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "flex-end",
          gap: 9, padding: "13px 20px",
          borderTop: `1px solid ${C.border}`, flexShrink: 0,
        }}>
          <button type="button" onClick={onCancel} style={{
            background: C.float, border: `1px solid ${C.border}`,
            color: C.fg, borderRadius: 8, padding: "7px 16px",
            fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!ok}
            onClick={() => onConfirm(lang)}
            title={!ok ? "Fix all errors before generating" : undefined}
            style={{
              background: ok ? `color-mix(in srgb, ${C.primary} 22%, ${C.float})` : C.float,
              border: `1px solid ${ok ? C.primary : C.border}`,
              color: ok ? C.primary : C.muted,
              borderRadius: 8, padding: "7px 20px",
              fontSize: 12, fontWeight: 700,
              cursor: ok ? "pointer" : "not-allowed",
              opacity: ok ? 1 : 0.5,
            }}
          >
            {errors.length > 0 ? `Fix ${errors.length} error${errors.length !== 1 ? "s" : ""}` : "Generate Code →"}
          </button>
        </div>
      </div>
    </div>
  );
}
