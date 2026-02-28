"use client";

import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
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

// ─────────────────────────────────────────────────────────────────────────────
// In-memory store  (module-level singleton — survives panel close/reopen)
// ─────────────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

class MemTable {
  private rows = new Map<string, Row>();
  private seq = 1;

  insert(row: Row): Row {
    const id = row.id != null ? String(row.id) : String(this.seq++);
    const newRow = { ...row, id };
    this.rows.set(id, newRow);
    return newRow;
  }
  all(): Row[] { return Array.from(this.rows.values()); }
  byId(id: string): Row | null { return this.rows.get(id) ?? null; }
  update(id: string, patch: Row): Row | null {
    const e = this.rows.get(id);
    if (!e) return null;
    const r = { ...e, ...patch, id };
    this.rows.set(id, r);
    return r;
  }
  delete(id: string): boolean { return this.rows.delete(id); }
  clear() { this.rows.clear(); this.seq = 1; }
  size() { return this.rows.size; }
  filter(fn: (r: Row) => boolean): Row[] { return this.all().filter(fn); }
}

const _db = new Map<string, MemTable>();
function getTable(name: string): MemTable {
  const k = name.toLowerCase().trim();
  if (!_db.has(k)) _db.set(k, new MemTable());
  return _db.get(k)!;
}

const _queues = new Map<string, { payload: string; ts: string }[]>();
function getQueue(id: string) {
  if (!_queues.has(id)) _queues.set(id, []);
  return _queues.get(id)!;
}

// Version counter — increment whenever the store changes to trigger re-renders
let _storeVersion = 0;
function bumpStore() { _storeVersion++; }

function resetAll() {
  _db.forEach((t) => t.clear());
  _queues.forEach((q) => (q.length = 0));
  bumpStore();
}

// ─────────────────────────────────────────────────────────────────────────────
// SQL executor
// ─────────────────────────────────────────────────────────────────────────────

function parseVal(s: string): unknown {
  s = s.trim();
  if (new RegExp("^'.*'$", "s").test(s) || new RegExp('^".*"$', "s").test(s)) return s.slice(1, -1);
  if (s.toLowerCase() === "null") return null;
  if (s.toLowerCase() === "true") return true;
  if (s.toLowerCase() === "false") return false;
  const n = Number(s);
  return isNaN(n) ? s : n;
}

function parseValueList(raw: string): unknown[] {
  const out: unknown[] = [];
  let cur = "", inStr = false, q = "";
  for (const ch of raw) {
    if (!inStr && (ch === "'" || ch === '"')) { inStr = true; q = ch; cur += ch; }
    else if (inStr && ch === q) { inStr = false; cur += ch; }
    else if (!inStr && ch === ",") { out.push(parseVal(cur.trim())); cur = ""; }
    else cur += ch;
  }
  if (cur.trim()) out.push(parseVal(cur.trim()));
  return out;
}

function matches(row: Row, where: string): boolean {
  return where.split(/\s+AND\s+/i).every((part) => {
    const m = part.trim().match(
      /(\w+)\s*(=|!=|<>|>=|<=|>|<|LIKE|IS\s+NOT\s+NULL|IS\s+NULL)\s*(.*)/i
    );
    if (!m) return true;
    const [, col, rawOp, rawVal] = m;
    const op = rawOp.trim().toUpperCase().replace(/\s+/g, " ");
    const rv = row[col];
    const val = parseVal(rawVal.trim());
    if (op === "IS NULL") return rv == null;
    if (op === "IS NOT NULL") return rv != null;
    if (op === "=") return String(rv) === String(val);
    if (op === "!=" || op === "<>") return String(rv) !== String(val);
    if (op === ">") return Number(rv) > Number(val);
    if (op === "<") return Number(rv) < Number(val);
    if (op === ">=") return Number(rv) >= Number(val);
    if (op === "<=") return Number(rv) <= Number(val);
    if (op === "LIKE")
      return String(rv).toLowerCase().includes(String(val).toLowerCase().replace(/%/g, ""));
    return true;
  });
}

type SQLResult = { rows: Row[]; affected: number; msg: string; error?: string };

function execSQL(rawSQL: string): SQLResult {
  const sql = rawSQL.trim().replace(/;+$/, "").trim();
  const kw = sql.split(/\s+/)[0]?.toUpperCase();
  try {
    // ── SELECT ──────────────────────────────────────────────────────────────
    if (kw === "SELECT") {
      const fromM = sql.match(/\bFROM\s+(\w+)/i);
      if (!fromM) throw new Error("Missing FROM clause");
      const tbl = getTable(fromM[1]);

      const whereM = sql.match(/\bWHERE\s+(.+?)(?:\s+ORDER\s+BY|\s+LIMIT|\s*$)/i);
      const orderM = sql.match(/\bORDER\s+BY\s+(\w+)(?:\s+(ASC|DESC))?/i);
      const limitM = sql.match(/\bLIMIT\s+(\d+)/i);

      let rows = whereM ? tbl.filter((r) => matches(r, whereM[1])) : tbl.all();

      if (orderM) {
        const col = orderM[1], desc = orderM[2]?.toUpperCase() === "DESC";
        rows = [...rows].sort((a, b) => {
          const aVal = String((a as Record<string, unknown>)[col] ?? "");
          const bVal = String((b as Record<string, unknown>)[col] ?? "");
          return desc ? (aVal < bVal ? 1 : -1) : (aVal > bVal ? 1 : -1);
        });
      }

      const limit = limitM ? parseInt(limitM[1]) : 200;
      rows = rows.slice(0, limit);
      return { rows, affected: rows.length, msg: `${rows.length} row(s) returned` };
    }

    // ── INSERT ───────────────────────────────────────────────────────────────
    if (kw === "INSERT") {
      const m = sql.match(/INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
      if (!m) throw new Error("Syntax: INSERT INTO table (col,…) VALUES (val,…)");
      const cols = m[2].split(",").map((c) => c.trim());
      const vals = parseValueList(m[3]);
      if (cols.length !== vals.length)
        throw new Error(`${cols.length} columns vs ${vals.length} values`);
      const row: Row = {};
      cols.forEach((c, i) => { row[c] = vals[i]; });
      const inserted = getTable(m[1]).insert(row);
      bumpStore();
      return { rows: [inserted], affected: 1, msg: "1 row inserted" };
    }

    // ── UPDATE ───────────────────────────────────────────────────────────────
    if (kw === "UPDATE") {
      const m = sql.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)(?:\s+WHERE\s+(.+?))?$/i);
      if (!m) throw new Error("Syntax: UPDATE table SET col=val [WHERE …]");
      const tbl = getTable(m[1]);
      const patch: Row = {};
      m[2].split(",").forEach((p) => {
        const eq = p.trim().match(/(\w+)\s*=\s*(.+)/);
        if (eq) patch[eq[1]] = parseVal(eq[2].trim());
      });
      const targets = m[3] ? tbl.filter((r) => matches(r, m[3])) : tbl.all();
      let count = 0;
      for (const r of targets) { tbl.update(String(r.id), patch); count++; }
      bumpStore();
      return { rows: [], affected: count, msg: `${count} row(s) updated` };
    }

    // ── DELETE ───────────────────────────────────────────────────────────────
    if (kw === "DELETE") {
      const m = sql.match(/DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+?))?$/i);
      if (!m) throw new Error("Syntax: DELETE FROM table [WHERE …]");
      const tbl = getTable(m[1]);
      if (!m[2]) {
        const c = tbl.size(); tbl.clear(); bumpStore();
        return { rows: [], affected: c, msg: `Table cleared (${c} rows deleted)` };
      }
      const targets = tbl.filter((r) => matches(r, m[2]));
      let c = 0;
      for (const r of targets) { tbl.delete(String(r.id)); c++; }
      bumpStore();
      return { rows: [], affected: c, msg: `${c} row(s) deleted` };
    }

    throw new Error(`Unsupported statement: ${kw}`);
  } catch (e) {
    return { rows: [], affected: 0, msg: "", error: e instanceof Error ? e.message : String(e) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// API CRUD helper
// ─────────────────────────────────────────────────────────────────────────────

function resourceName(route = ""): string {
  const segs = route.split("/").filter(Boolean);
  const meaningful = segs.filter(
    (s) => !s.startsWith(":") && !s.startsWith("{") && s !== "api" && !/^v\d+$/.test(s)
  );
  return (meaningful[meaningful.length - 1] ?? "records").toLowerCase();
}

function extractId(route: string, pathVals: Record<string, string>): string | null {
  for (const seg of route.split("/")) {
    if (seg.startsWith(":")) return pathVals[seg.slice(1)] ?? null;
    if (seg.startsWith("{") && seg.endsWith("}")) return pathVals[seg.slice(1, -1)] ?? null;
  }
  return null;
}

function coerce(v: string): unknown {
  if (v === "") return "";
  if (v === "true") return true;
  if (v === "false") return false;
  if (!isNaN(Number(v)) && v.trim() !== "") return Number(v);
  return v;
}

function handleApiRequest(
  method: string,
  route: string,
  pathVals: Record<string, string>,
  queryVals: Record<string, string>,
  bodyVals: Record<string, string>
): { status: number; body: unknown } {
  const res = resourceName(route);
  const id = extractId(route, pathVals);

  if (method === "GET") {
    if (id) {
      const row = getTable(res).byId(id);
      return row ? { status: 200, body: row } : { status: 404, body: { error: "Not found", id } };
    }
    // Support simple query filters  e.g. ?status=active
    const allRows = getTable(res).all();
    const filtered = Object.keys(queryVals).length
      ? allRows.filter((r) =>
        Object.entries(queryVals).every(([k, v]) => v === "" || String(r[k]) === v)
      )
      : allRows;
    return { status: 200, body: filtered };
  }

  if (method === "POST") {
    const row: Row = {};
    for (const [k, v] of Object.entries(bodyVals)) row[k] = coerce(v);
    const inserted = getTable(res).insert(row);
    bumpStore();
    return { status: 201, body: inserted };
  }

  if (method === "PUT" || method === "PATCH") {
    const targetId = id ?? bodyVals.id;
    if (!targetId) return { status: 400, body: { error: "Missing id" } };
    const patch: Row = {};
    for (const [k, v] of Object.entries(bodyVals)) patch[k] = coerce(v);
    const updated = getTable(res).update(String(targetId), patch);
    if (!updated) {
      patch.id = targetId;
      const created = getTable(res).insert(patch);
      bumpStore();
      return { status: 201, body: created };
    }
    bumpStore();
    return { status: 200, body: updated };
  }

  if (method === "DELETE") {
    const targetId = id ?? pathVals.id ?? bodyVals.id;
    if (!targetId) return { status: 400, body: { error: "Missing id" } };
    const ok = getTable(res).delete(String(targetId));
    if (!ok) return { status: 404, body: { error: "Not found", id: targetId } };
    bumpStore();
    return { status: 200, body: { message: "Deleted", id: targetId } };
  }

  return { status: 405, body: { error: "Method not allowed" } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock helpers (for field prefill)
// ─────────────────────────────────────────────────────────────────────────────

function mockStr(name: string): string {
  const n = name.toLowerCase();
  if (n === "id" || (n.endsWith("_id") && !n.includes("valid"))) return "1";
  if (n.includes("email")) return "user@example.com";
  if (n.includes("password") || n.includes("secret")) return "Secret123!";
  if (n.includes("token")) return "tok_abc123";
  if (n.includes("first")) return "Jane";
  if (n.includes("last")) return "Smith";
  if (n.includes("name") && !n.includes("file")) return "Jane Smith";
  if (n.includes("phone")) return "+1-555-0100";
  if (n.includes("url") || n.includes("link") || n.includes("uri")) return "https://example.com";
  if (n.includes("_at") || n.includes("date")) return new Date().toISOString().split("T")[0];
  if (n.includes("status")) return "active";
  if (n.includes("role")) return "user";
  if (n.includes("message") || n.includes("body") || n.includes("content")) return "Hello world";
  if (n.includes("title")) return "My Title";
  if (n.includes("description") || n.includes("bio")) return "Short description";
  if (n.includes("city")) return "San Francisco";
  if (n.includes("country")) return "US";
  if (n.includes("address")) return "123 Main St";
  return "sample";
}

function mockForField(name: string, type: string): string {
  if (type === "boolean") return "true";
  if (type === "number") {
    const n = name.toLowerCase();
    if (n.includes("age")) return "28";
    if (n.includes("price") || n.includes("amount")) return "29.99";
    if (n.includes("count") || n.includes("limit")) return "10";
    return "42";
  }
  if (type === "object" || type === "array") return "";
  return mockStr(name);
}

function seedRow(fields: { name: string; type: string }[], index = 0): Row {
  const NAMES = ["Alice Johnson", "Bob Williams", "Carol Davis", "Dan Martinez", "Eve Wilson"];
  const EMAILS = ["alice@example.com", "bob@example.com", "carol@example.com", "dan@example.com", "eve@example.com"];
  const row: Row = {};
  for (const f of fields) {
    const n = f.name.toLowerCase();
    const t = f.type;
    if (t === "boolean") { row[f.name] = index % 3 !== 0; continue; }
    if (t === "int" || t === "bigint" || t === "number") { row[f.name] = (index + 1) * 10; continue; }
    if (t === "float" || t === "decimal") { row[f.name] = +((index + 1) * 9.99).toFixed(2); continue; }
    if (t === "uuid") { row[f.name] = mockStr("id"); continue; }
    if (t === "json") { row[f.name] = { key: `value_${index + 1}` }; continue; }
    if (t === "date") { row[f.name] = new Date(Date.now() - index * 86400000).toISOString().split("T")[0]; continue; }
    if (t === "datetime") { row[f.name] = new Date(Date.now() - index * 86400000).toISOString(); continue; }
    // string heuristics
    if (n.includes("email")) { row[f.name] = EMAILS[index % EMAILS.length]; continue; }
    if (n.includes("name") && !n.includes("file")) { row[f.name] = NAMES[index % NAMES.length]; continue; }
    if (n.includes("status")) { row[f.name] = index % 2 === 0 ? "active" : "inactive"; continue; }
    if (n.includes("role")) { row[f.name] = index === 0 ? "admin" : "user"; continue; }
    if (n.includes("phone")) { row[f.name] = `+1-555-010${index}`; continue; }
    row[f.name] = `${f.name}_${index + 1}`;
  }
  return row;
}

function wait(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }
function randMs(lo = 60, hi = 400) { return Math.floor(Math.random() * (hi - lo) + lo); }
function initVals(fields: InputField[]) {
  return Object.fromEntries(fields.map((f) => [f.name, mockForField(f.name, f.type)]));
}

// ─────────────────────────────────────────────────────────────────────────────
// Style tokens
// ─────────────────────────────────────────────────────────────────────────────

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

const MC: Record<string, string> = {
  GET: "#22c55e", POST: "#87a3ff", PUT: "#f59e0b", PATCH: "#f59e0b", DELETE: "#ef4444",
};

const INPUT: React.CSSProperties = {
  width: "100%", background: C.bg, border: `1px solid ${C.border}`,
  color: C.fg, borderRadius: 7, padding: "7px 10px", fontSize: 12,
  fontFamily: "inherit", outline: "none", boxSizing: "border-box",
};

const btn = (primary = false, danger = false): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", gap: 7,
  border: `1px solid ${danger ? C.red : primary ? C.primary : C.border}`,
  background: danger
    ? `color-mix(in srgb, ${C.red} 15%, ${C.panel})`
    : primary
      ? `color-mix(in srgb, ${C.primary} 18%, ${C.panel})`
      : C.float,
  color: C.fg, borderRadius: 8, padding: "7px 14px",
  fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0,
});

// ─────────────────────────────────────────────────────────────────────────────
// Atoms
// ─────────────────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <>
      <style>{`@keyframes _s{to{transform:rotate(360deg)}}`}</style>
      <span style={{
        display: "inline-block", width: 13, height: 13,
        border: `2px solid ${C.border}`, borderTopColor: C.primary,
        borderRadius: "50%", animation: "_s .7s linear infinite", flexShrink: 0,
      }} />
    </>
  );
}

function Badge({ label, color = C.primary }: { label: string; color?: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
      padding: "2px 7px", borderRadius: 5,
      background: `color-mix(in srgb, ${color} 18%, ${C.panel})`,
      color, border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
      flexShrink: 0,
    }}>
      {label}
    </span>
  );
}

function SLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 6 }}>{children}</div>;
}

function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14, ...style }}>
      {children}
    </div>
  );
}

function Code({ value, maxH = 260 }: { value: unknown; maxH?: number }) {
  return (
    <pre style={{
      fontFamily: "Menlo, Consolas, 'Courier New', monospace", fontSize: 11,
      background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8,
      padding: "10px 12px", color: C.fg, whiteSpace: "pre", overflowX: "auto",
      overflowY: "auto", maxHeight: maxH, lineHeight: 1.6, margin: 0,
    }}>
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// JsonHighlight — syntax-coloured JSON viewer
// ─────────────────────────────────────────────────────────────────────────────

function JsonHighlight({ value, maxH = 360 }: { value: unknown; maxH?: number }) {
  const text = JSON.stringify(value, null, 2);
  type Token = { t: string; c: string };
  const tokens: Token[] = [];
  // regex groups: 1=key, 2=string-value, 3=number, 4=bool/null, 5=punctuation
  const re = /("(?:[^"\\]|\\.)*")\s*:|(\"(?:[^"\\]|\\.)*\")|([-\d.eE+]+(?!["\w.]))|(\btrue\b|\bfalse\b|\bnull\b)|([{}\[\],:])/g;
  let last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) tokens.push({ t: text.slice(last, m.index), c: C.fg });
    if (m[1]) {
      tokens.push({ t: m[1], c: "#93c5fd" });
      tokens.push({ t: text.slice(m.index + m[1].length, re.lastIndex), c: C.muted });
    } else if (m[2]) tokens.push({ t: m[2], c: "#86efac" });
    else if (m[3]) tokens.push({ t: m[3], c: "#fcd34d" });
    else if (m[4]) tokens.push({ t: m[4], c: "#f9a8d4" });
    else if (m[5]) tokens.push({ t: m[5], c: C.muted });
    last = re.lastIndex;
  }
  if (last < text.length) tokens.push({ t: text.slice(last), c: C.fg });
  return (
    <pre style={{
      fontFamily: "Menlo, Consolas, 'Courier New', monospace", fontSize: 12,
      background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8,
      padding: "12px 14px", margin: 0, whiteSpace: "pre",
      overflowX: "auto", overflowY: "auto", maxHeight: maxH, lineHeight: 1.65,
    }}>
      {tokens.map((tok, i) => <span key={i} style={{ color: tok.c }}>{tok.t}</span>)}
    </pre>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TabBar + KVTable — Postman-style request editor primitives
// ─────────────────────────────────────────────────────────────────────────────

type KVRow = { id: string; enabled: boolean; key: string; value: string };
function mkKV(key = "", value = ""): KVRow {
  return { id: Math.random().toString(36).slice(2), enabled: true, key, value };
}

function TabBar({ tabs, active, onChange }: {
  tabs: string[]; active: string; onChange: (t: string) => void;
}) {
  return (
    <div style={{ display: "flex", borderBottom: `1px solid ${C.border}` }}>
      {tabs.map((t) => {
        const on = t === active;
        return (
          <button key={t} type="button" onClick={() => onChange(t)} style={{
            background: "none", border: "none",
            borderBottom: `2px solid ${on ? C.primary : "transparent"}`,
            color: on ? C.primary : C.muted,
            padding: "8px 16px", fontSize: 12, fontWeight: on ? 600 : 400,
            cursor: "pointer", marginBottom: -1, transition: "color .15s, border-color .15s",
          }}>
            {t}
          </button>
        );
      })}
    </div>
  );
}

function KVTable({ rows, onChange, keyPlaceholder = "Key", valPlaceholder = "Value" }: {
  rows: KVRow[];
  onChange: (rows: KVRow[]) => void;
  keyPlaceholder?: string;
  valPlaceholder?: string;
}) {
  const update = (id: string, patch: Partial<KVRow>) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const remove = (id: string) => onChange(rows.filter((r) => r.id !== id));
  const add = () => onChange([...rows, mkKV()]);

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {rows.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "18px 1fr 2fr 22px", gap: "4px 8px", marginBottom: 6 }}>
          <span />
          <span style={{ fontSize: 10, color: C.muted, fontWeight: 600, letterSpacing: "0.05em" }}>KEY</span>
          <span style={{ fontSize: 10, color: C.muted, fontWeight: 600, letterSpacing: "0.05em" }}>VALUE</span>
          <span />
        </div>
      )}
      {rows.map((r) => (
        <div key={r.id} style={{ display: "grid", gridTemplateColumns: "18px 1fr 2fr 22px", gap: "4px 8px", alignItems: "center", marginBottom: 5 }}>
          <input type="checkbox" checked={r.enabled} onChange={(e) => update(r.id, { enabled: e.target.checked })}
            style={{ flexShrink: 0, accentColor: C.primary, width: 13, height: 13 }} />
          <input style={{ ...INPUT, opacity: r.enabled ? 1 : 0.45, padding: "6px 8px" }}
            placeholder={keyPlaceholder} value={r.key}
            onChange={(e) => update(r.id, { key: e.target.value })} />
          <input style={{ ...INPUT, opacity: r.enabled ? 1 : 0.45, padding: "6px 8px" }}
            placeholder={valPlaceholder} value={r.value}
            onChange={(e) => update(r.id, { value: e.target.value })} />
          <button type="button" onClick={() => remove(r.id)}
            style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 15, padding: 0, lineHeight: 1 }}>
            ×
          </button>
        </div>
      ))}
      <button type="button" onClick={add}
        style={{ ...btn(), fontSize: 11, padding: "4px 10px", marginTop: 4, alignSelf: "flex-start" }}>
        + Add row
      </button>
    </div>
  );
}

type RunResult = { status: number; latency: number; body: unknown };

function ResultBox({ r }: { r: RunResult }) {
  const ok = r.status < 400;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Badge label={`${r.status}`} color={ok ? C.green : C.red} />
        <span style={{ fontSize: 11, color: C.muted }}>{r.latency}ms</span>
      </div>
      <JsonHighlight value={r.body} maxH={260} />
    </div>
  );
}

function FieldInputs({
  label, fields, values, onChange,
}: {
  label: string; fields: InputField[];
  values: Record<string, string>;
  onChange: (k: string, v: string) => void;
}) {
  if (!fields.length) return null;
  return (
    <div>
      <SLabel>{label}</SLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {fields.map((f) => (
          <div key={f.name}>
            <label style={{ fontSize: 11, color: C.muted, display: "flex", gap: 4, alignItems: "center", marginBottom: 4 }}>
              <span style={{ color: C.fg, fontWeight: 500 }}>{f.name}</span>
              {f.required && <span style={{ color: C.red }}>*</span>}
              {f.type !== "string" && <span>({f.type})</span>}
            </label>
            {f.type === "boolean" ? (
              <select style={INPUT} value={values[f.name] ?? "true"} onChange={(e) => onChange(f.name, e.target.value)}>
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            ) : f.type === "object" || f.type === "array" ? (
              <textarea style={{ ...INPUT, minHeight: 56, resize: "vertical", fontFamily: "monospace" }}
                value={values[f.name] ?? ""} onChange={(e) => onChange(f.name, e.target.value)}
                placeholder={f.type === "object" ? '{"key": "value"}' : '["item1"]'} spellCheck={false} />
            ) : (
              <input style={INPUT} value={values[f.name] ?? ""} onChange={(e) => onChange(f.name, e.target.value)}
                placeholder={mockForField(f.name, f.type)} type={f.type === "number" ? "number" : "text"} />
            )}
            {f.description && <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>{f.description}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// API Pane — Postman-style request builder + real CRUD against in-memory store
// ─────────────────────────────────────────────────────────────────────────────

type AuthType = "None" | "Bearer" | "API Key" | "Basic";
type BodyMode = "none" | "json" | "form";

function ApiPane({ node, sv }: { node: ApiBinding; sv: number }) {
  void sv;
  const isRest = node.protocol === "rest";

  // ── request state ──────────────────────────────────────────────────────────
  const [method, setMethod] = useState<string>(node.method ?? "GET");
  const [url, setUrl] = useState(node.route ?? "/");

  const pathFields  = node.request?.pathParams  ?? [];
  const queryFields = node.request?.queryParams ?? [];
  const headerFields = node.request?.headers   ?? [];
  const bodyFields  = node.request?.body?.schema ?? [];

  const [paramRows, setParamRows] = useState<KVRow[]>(() => [
    ...pathFields .map((f) => mkKV(f.name, mockForField(f.name, f.type))),
    ...queryFields.map((f) => mkKV(f.name, mockForField(f.name, f.type))),
  ]);
  const [headerRows, setHeaderRows] = useState<KVRow[]>(() =>
    headerFields.map((f) => mkKV(f.name, mockForField(f.name, f.type)))
  );
  const [authType, setAuthType] = useState<AuthType>("None");
  const [authToken, setAuthToken]   = useState("");
  const [apiKeyName, setApiKeyName] = useState("X-API-Key");
  const [apiKeyVal, setApiKeyVal]   = useState("");
  const [basicUser, setBasicUser]   = useState("");
  const [basicPass, setBasicPass]   = useState("");

  const [bodyMode, setBodyMode] = useState<BodyMode>(bodyFields.length > 0 ? "json" : "none");
  const [bodyJson, setBodyJson] = useState(() => {
    if (!bodyFields.length) return "";
    const obj: Record<string, unknown> = {};
    bodyFields.forEach((f) => { obj[f.name] = mockForField(f.name, f.type); });
    return JSON.stringify(obj, null, 2);
  });
  const [bodyForm, setBodyForm] = useState<KVRow[]>(() =>
    bodyFields.map((f) => mkKV(f.name, mockForField(f.name, f.type)))
  );
  const [jsonError, setJsonError] = useState<string | null>(null);

  // ── response state ────────────────────────────────────────────────────────
  const [running, setRunning] = useState(false);
  const [result, setResult]   = useState<RunResult | null>(null);
  const [resTab, setResTab]   = useState<"Body" | "Headers">("Body");
  const [reqTab, setReqTab]   = useState<"Params" | "Auth" | "Headers" | "Body">("Params");

  // static response headers (simulated)
  const resHeaders = useMemo(() => ({
    "Content-Type": "application/json",
    "X-Request-Id": "req_" + Math.random().toString(36).slice(2, 10),
    "Cache-Control": "no-cache",
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── constructed URL preview ───────────────────────────────────────────────
  const constructedUrl = useMemo(() => {
    let u = url;
    paramRows.filter((r) => r.enabled && r.key && url.includes(`:${r.key}`))
      .forEach((r) => { u = u.replace(`:${r.key}`, encodeURIComponent(r.value)); });
    const qRows = paramRows.filter((r) => r.enabled && r.key && !url.includes(`:${r.key}`));
    if (qRows.length) {
      const qs = qRows.map((r) => `${encodeURIComponent(r.key)}=${encodeURIComponent(r.value)}`).join("&");
      u += (u.includes("?") ? "&" : "?") + qs;
    }
    return u;
  }, [url, paramRows]);

  // ── send ──────────────────────────────────────────────────────────────────
  const send = useCallback(async () => {
    const bodyVals: Record<string, string> = {};
    if (bodyMode === "json" && bodyJson.trim()) {
      try {
        const parsed = JSON.parse(bodyJson);
        if (typeof parsed === "object" && parsed !== null)
          Object.entries(parsed).forEach(([k, v]) => { bodyVals[k] = String(v); });
        setJsonError(null);
      } catch {
        setJsonError("Invalid JSON — fix before sending");
        return;
      }
    } else if (bodyMode === "form") {
      bodyForm.filter((r) => r.enabled && r.key).forEach((r) => { bodyVals[r.key] = r.value; });
    }
    const pathVals: Record<string, string> = {};
    paramRows.filter((r) => r.enabled && r.key && url.includes(`:${r.key}`))
      .forEach((r) => { pathVals[r.key] = r.value; });
    const queryVals: Record<string, string> = {};
    paramRows.filter((r) => r.enabled && r.key && !url.includes(`:${r.key}`))
      .forEach((r) => { queryVals[r.key] = r.value; });

    setRunning(true);
    const ms = randMs(60, 300);
    await wait(ms);
    const { status, body } = handleApiRequest(method, url, pathVals, queryVals, bodyVals);
    setResult({ status, latency: ms, body });
    setResTab("Body");
    setRunning(false);
  }, [method, url, paramRows, bodyMode, bodyJson, bodyForm]);

  // ── non-REST fallback ─────────────────────────────────────────────────────
  if (!isRest) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <NodeTitle label={node.label} desc={node.description}>
          <Badge label={node.protocol.toUpperCase()} />
        </NodeTitle>
        <Panel>
          <SLabel>Protocol Config</SLabel>
          {node.instance
            ? <JsonHighlight value={(node.instance as { config: unknown }).config} />
            : <div style={{ fontSize: 12, color: C.muted }}>No instance config defined.</div>
          }
        </Panel>
        <div style={{ fontSize: 12, color: C.muted }}>
          Live connection testing for <strong style={{ color: C.fg }}>{node.protocol}</strong> requires a running server.
        </div>
      </div>
    );
  }

  const resource = resourceName(url);
  const recordCount = getTable(resource).size();
  const methodColor = MC[method] ?? C.primary;
  const statusOk = result && result.status < 400;
  const statusColor = result ? (statusOk ? C.green : C.red) : C.muted;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── endpoint title ── */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: C.fg }}>{node.label}</span>
          {node.deprecated && <Badge label="DEPRECATED" color={C.amber} />}
        </div>
        {node.description && <div style={{ fontSize: 12, color: C.muted }}>{node.description}</div>}
        <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
          Resource: <code style={{ color: C.primary }}>{resource}</code>
          {" · "}
          <span style={{ color: recordCount > 0 ? C.green : C.muted }}>
            {recordCount} record{recordCount !== 1 ? "s" : ""} stored
          </span>
        </div>
      </div>

      {/* ── URL bar ── */}
      <div style={{
        display: "flex", border: `1px solid ${C.border}`,
        borderRadius: 9, overflow: "hidden", background: C.bg,
      }}>
        <select value={method} onChange={(e) => setMethod(e.target.value)} style={{
          background: `color-mix(in srgb, ${methodColor} 18%, ${C.float})`,
          color: methodColor, border: "none", padding: "0 14px",
          fontSize: 12, fontWeight: 700, fontFamily: "monospace",
          cursor: "pointer", outline: "none", minWidth: 94, flexShrink: 0,
        }}>
          {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <div style={{ width: 1, background: C.border, flexShrink: 0 }} />
        <input
          value={url} onChange={(e) => setUrl(e.target.value)}
          placeholder="/api/resource/:id" spellCheck={false}
          style={{
            flex: 1, background: "transparent", border: "none",
            color: C.fg, padding: "11px 14px", fontSize: 13,
            fontFamily: "Menlo, Consolas, monospace", outline: "none",
          }}
        />
        <button type="button" onClick={send} disabled={running} style={{
          background: running ? C.float : `color-mix(in srgb, ${C.primary} 22%, ${C.float})`,
          color: running ? C.muted : C.primary, border: "none",
          padding: "0 22px", fontSize: 13, fontWeight: 700,
          cursor: running ? "not-allowed" : "pointer",
          display: "flex", alignItems: "center", gap: 7, flexShrink: 0,
        }}>
          {running ? <><Spinner /> Sending…</> : "Send"}
        </button>
      </div>

      {/* constructed URL hint */}
      {constructedUrl !== url && (
        <div style={{ fontSize: 11, color: C.muted, marginTop: -10, fontFamily: "monospace" }}>
          → {constructedUrl}
        </div>
      )}

      {/* ── request editor ── */}
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 9, overflow: "hidden" }}>
        <TabBar
          tabs={["Params", "Auth", "Headers", "Body"]}
          active={reqTab}
          onChange={(t) => setReqTab(t as typeof reqTab)}
        />
        <div style={{ padding: 14 }}>

          {reqTab === "Params" && (
            <KVTable rows={paramRows} onChange={setParamRows}
              keyPlaceholder="param" valPlaceholder="value" />
          )}

          {reqTab === "Auth" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <SLabel>Type</SLabel>
                <select style={INPUT} value={authType}
                  onChange={(e) => setAuthType(e.target.value as AuthType)}>
                  {(["None", "Bearer", "API Key", "Basic"] as AuthType[]).map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              {authType === "Bearer" && (
                <div>
                  <SLabel>Token</SLabel>
                  <input style={INPUT} value={authToken}
                    onChange={(e) => setAuthToken(e.target.value)}
                    placeholder="eyJhbGciOiJIUzI1NiIs…" />
                </div>
              )}
              {authType === "API Key" && (
                <>
                  <div>
                    <SLabel>Header name</SLabel>
                    <input style={INPUT} value={apiKeyName} onChange={(e) => setApiKeyName(e.target.value)} />
                  </div>
                  <div>
                    <SLabel>Value</SLabel>
                    <input style={INPUT} value={apiKeyVal}
                      onChange={(e) => setApiKeyVal(e.target.value)} placeholder="sk-…" />
                  </div>
                </>
              )}
              {authType === "Basic" && (
                <>
                  <div>
                    <SLabel>Username</SLabel>
                    <input style={INPUT} value={basicUser} onChange={(e) => setBasicUser(e.target.value)} />
                  </div>
                  <div>
                    <SLabel>Password</SLabel>
                    <input style={{ ...INPUT, fontFamily: "monospace" }} type="password"
                      value={basicPass} onChange={(e) => setBasicPass(e.target.value)} />
                  </div>
                </>
              )}
              {authType === "None" && (
                <div style={{ fontSize: 12, color: C.muted }}>No authentication.</div>
              )}
            </div>
          )}

          {reqTab === "Headers" && (
            <KVTable rows={headerRows} onChange={setHeaderRows}
              keyPlaceholder="Header-Name" valPlaceholder="value" />
          )}

          {reqTab === "Body" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", gap: 16 }}>
                {(["none", "json", "form"] as BodyMode[]).map((t) => (
                  <label key={t} style={{
                    display: "flex", alignItems: "center", gap: 5, fontSize: 12,
                    color: bodyMode === t ? C.fg : C.muted, cursor: "pointer",
                  }}>
                    <input type="radio" name="bodyMode" checked={bodyMode === t}
                      onChange={() => setBodyMode(t)} style={{ accentColor: C.primary }} />
                    {t === "none" ? "none" : t === "json" ? "raw JSON" : "form-data"}
                  </label>
                ))}
              </div>
              {bodyMode === "json" && (
                <div>
                  <textarea
                    style={{
                      ...INPUT, minHeight: 140, resize: "vertical",
                      fontFamily: "Menlo, Consolas, monospace", fontSize: 12,
                    }}
                    value={bodyJson}
                    onChange={(e) => { setBodyJson(e.target.value); setJsonError(null); }}
                    spellCheck={false}
                    placeholder={'{\n  "key": "value"\n}'}
                  />
                  {jsonError && (
                    <div style={{ fontSize: 11, color: C.red, marginTop: 4 }}>⚠ {jsonError}</div>
                  )}
                </div>
              )}
              {bodyMode === "form" && (
                <KVTable rows={bodyForm} onChange={setBodyForm} />
              )}
              {bodyMode === "none" && (
                <div style={{ fontSize: 12, color: C.muted }}>This request has no body.</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── response section ── */}
      {result && (
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 9, overflow: "hidden" }}>
          {/* status bar */}
          <div style={{
            display: "flex", alignItems: "center", gap: 12, padding: "9px 16px",
            background: `color-mix(in srgb, ${statusColor} 8%, ${C.float})`,
            borderBottom: `1px solid ${C.border}`,
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: statusColor }}>
              {result.status} {statusOk ? "OK" : "Error"}
            </span>
            <span style={{ fontSize: 11, color: C.muted }}>{result.latency} ms</span>
            <span style={{ fontSize: 11, color: C.muted }}>
              {JSON.stringify(result.body).length} B
            </span>
          </div>
          <TabBar tabs={["Body", "Headers"]} active={resTab} onChange={(t) => setResTab(t as typeof resTab)} />
          <div style={{ padding: 14 }}>
            {resTab === "Body" && <JsonHighlight value={result.body} maxH={380} />}
            {resTab === "Headers" && (
              <div>
                {Object.entries(resHeaders).map(([k, v]) => (
                  <div key={k} style={{
                    display: "flex", padding: "6px 0",
                    borderBottom: `1px solid ${C.border}`, gap: 16, fontSize: 12,
                  }}>
                    <span style={{ color: "#93c5fd", fontFamily: "monospace", minWidth: 180 }}>{k}</span>
                    <span style={{ color: C.fg, fontFamily: "monospace" }}>{v}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Function Pane
// ─────────────────────────────────────────────────────────────────────────────

function FunctionPane({ node }: { node: ProcessDefinition }) {
  const [values, setValues] = useState<Record<string, string>>(() => ({
    ...initVals(node.inputs),
    ...(node.testInputs ?? {}),
  }));
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<{ ms: number; text: string }[]>([]);
  const [result, setResult] = useState<RunResult | null>(null);

  const run = useCallback(async () => {
    setRunning(true);
    setLog([]);
    setResult(null);
    const steps = node.steps.length > 0
      ? node.steps
      : [
        { id: "1", kind: "compute" as const, description: "Validate inputs" },
        { id: "2", kind: "compute" as const, description: "Execute business logic" },
        { id: "3", kind: "return" as const, description: "Return result" },
      ];

    const t0 = Date.now();
    const outputAccum: Record<string, unknown> = {};

    for (const step of steps) {
      await wait(randMs(30, 160));
      const elapsed = Date.now() - t0;
      const desc = step.description || step.kind;

      // For db_operation steps, actually query the store
      if (step.kind === "db_operation") {
        const target = (step.config?.target as string) ?? "";
        const op = (step.config?.operation as string)?.toUpperCase() ?? "SELECT";
        if (target) {
          if (op === "SELECT") {
            outputAccum[target] = getTable(target).all().slice(0, 5);
          } else if (op === "INSERT") {
            const row: Row = {};
            for (const [k, v] of Object.entries(values)) row[k] = coerce(v);
            outputAccum[target] = getTable(target).insert(row);
            bumpStore();
          }
        }
      }

      setLog((prev) => [...prev, { ms: elapsed, text: `${step.kind}: ${desc}` }]);
    }

    const latency = Date.now() - t0;
    const successOutputs = node.outputs?.success ?? [];
    const body: Record<string, unknown> = successOutputs.length
      ? Object.fromEntries(
        successOutputs.map((f) => [
          f.name,
          outputAccum[f.name] ?? (f.type === "number" ? 0 : f.type === "boolean" ? true : mockStr(f.name)),
        ])
      )
      : { success: true };

    setResult({ status: 200, latency, body });
    setRunning(false);
  }, [node, values]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <NodeTitle label={node.label} desc={node.description}>
        <Badge label={node.processType === "start_function" ? "Start" : "Function"} />
        <Badge label={node.execution} color={C.muted} />
      </NodeTitle>

      {node.inputs.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <SLabel>Inputs {node.testInputs && Object.keys(node.testInputs).length > 0 && (
            <span style={{ color: C.green, fontWeight: 400 }}> · pre-filled from test inputs</span>
          )}</SLabel>
          {node.inputs.map((f) => (
            <div key={f.name}>
              <label style={{ fontSize: 11, color: C.muted, display: "flex", gap: 4, marginBottom: 4 }}>
                <span style={{ color: C.fg, fontWeight: 500 }}>{f.name}</span>
                {f.required && <span style={{ color: C.red }}>*</span>}
                <span>({f.type})</span>
              </label>
              <input style={INPUT} value={values[f.name] ?? ""}
                onChange={(e) => setValues((p) => ({ ...p, [f.name]: e.target.value }))}
                placeholder={mockForField(f.name, f.type)} />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: C.muted }}>This function takes no inputs.</div>
      )}

      <button style={btn(true)} onClick={run} disabled={running}>
        {running ? <><Spinner /> Running…</> : "▶  Run Function"}
      </button>

      {(log.length > 0 || running) && (
        <Panel>
          <SLabel>Execution Log</SLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {log.map((e, i) => (
              <div key={i} style={{ display: "flex", gap: 10, fontSize: 11, fontFamily: "monospace" }}>
                <span style={{ color: C.muted, minWidth: 50 }}>[{e.ms}ms]</span>
                <span style={{ color: C.green }}>✓</span>
                <span style={{ color: C.fg }}>{e.text}</span>
              </div>
            ))}
            {running && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 11 }}>
                <Spinner /><span style={{ color: C.muted }}>Executing…</span>
              </div>
            )}
          </div>
        </Panel>
      )}

      {result && (
        <div>
          <SLabel>Output</SLabel>
          <ResultBox r={result} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Database Pane — real SQL against in-memory store
// ─────────────────────────────────────────────────────────────────────────────

function DatabasePane({ node, sv }: { node: DatabaseBlock; sv: number }) {
  void sv;
  const [selectedTable, setSelectedTable] = useState(node.tables[0]?.name ?? "");
  const [sql, setSql] = useState("");
  const [running, setRunning] = useState(false);
  const [queryResult, setQueryResult] = useState<SQLResult | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  const currentTable = node.tables.find((t) => t.name === selectedTable);

  // When table changes, update default SQL
  useEffect(() => {
    if (currentTable) {
      const cols = currentTable.fields.map((f) => f.name).join(", ");
      setSql(`SELECT ${cols || "*"}\nFROM ${currentTable.name}\nLIMIT 20;`);
      setQueryResult(null);
    }
  }, [currentTable?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const runQuery = useCallback(async () => {
    if (!sql.trim()) return;
    setRunning(true);
    const ms = randMs(30, 180);
    await wait(ms);
    const r = execSQL(sql);
    setQueryResult(r);
    setRunning(false);
  }, [sql]);

  const seedTable = useCallback((count = 5) => {
    if (!currentTable) return;
    for (let i = 0; i < count; i++) {
      const row = seedRow(currentTable.fields.map((f) => ({ name: f.name, type: f.type })), i);
      getTable(currentTable.name).insert(row);
    }
    bumpStore();
    // Refresh with SELECT
    const r = execSQL(`SELECT * FROM ${currentTable.name} LIMIT 20;`);
    setQueryResult(r);
  }, [currentTable]);

  const insertTemplate = () => {
    if (!currentTable) return;
    const cols = currentTable.fields.filter((f) => !f.isPrimaryKey).map((f) => f.name);
    const vals = cols.map((c) => {
      const f = currentTable.fields.find((fi) => fi.name === c)!;
      const v = mockForField(f.name, f.type);
      return `'${v}'`;
    });
    setSql(`INSERT INTO ${currentTable.name} (${cols.join(", ")})\nVALUES (${vals.join(", ")});`);
    editorRef.current?.focus();
  };

  const DB_COLOR: Record<string, string> = { sql: C.primary, nosql: C.green, kv: C.amber, graph: "#a78bfa" };
  const storeCount = currentTable ? getTable(currentTable.name).size() : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <NodeTitle label={node.label} desc={node.description}>
        <Badge label={node.dbType.toUpperCase()} color={DB_COLOR[node.dbType] ?? C.primary} />
        {node.engine && <span style={{ fontSize: 11, color: C.muted }}>{node.engine}</span>}
      </NodeTitle>

      {node.tables.length === 0 ? (
        <div style={{ fontSize: 12, color: C.muted }}>
          No tables defined. Add tables in the Database designer first.
        </div>
      ) : (
        <>
          {/* Table selector */}
          <div>
            <SLabel>Table</SLabel>
            <select style={INPUT} value={selectedTable} onChange={(e) => setSelectedTable(e.target.value)}>
              {node.tables.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name} ({getTable(t.name).size()} rows in store)
                </option>
              ))}
            </select>
          </div>

          {/* Schema */}
          {currentTable && (
            <Panel>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <SLabel>Schema · {currentTable.name}</SLabel>
                <span style={{ fontSize: 11, color: storeCount > 0 ? C.green : C.muted }}>
                  {storeCount} row{storeCount !== 1 ? "s" : ""} in store
                </span>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", fontSize: 11, width: "100%" }}>
                  <thead>
                    <tr>
                      {["Column", "Type", "Nullable", ""].map((h) => (
                        <th key={h} style={{ textAlign: "left", color: C.muted, padding: "4px 10px", borderBottom: `1px solid ${C.border}`, fontWeight: 600 }}>{h}</th>
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

          {/* Quick actions */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={{ ...btn(), fontSize: 11, padding: "5px 10px" }} onClick={insertTemplate}>
              + Insert template
            </button>
            <button style={{ ...btn(), fontSize: 11, padding: "5px 10px" }} onClick={() => seedTable(5)}>
              Seed 5 rows
            </button>
            <button style={{ ...btn(false, true), fontSize: 11, padding: "5px 10px" }}
              onClick={() => { if (currentTable) { getTable(currentTable.name).clear(); bumpStore(); setQueryResult(null); } }}>
              Clear table
            </button>
          </div>

          {/* SQL editor */}
          <div>
            <SLabel>SQL Editor</SLabel>
            <textarea
              ref={editorRef}
              style={{ ...INPUT, minHeight: 90, resize: "vertical", fontFamily: "Menlo, Consolas, monospace", fontSize: 12 }}
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); runQuery(); } }}
              spellCheck={false}
              placeholder="SELECT * FROM users LIMIT 10;"
            />
            <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>Ctrl+Enter to run</div>
          </div>

          <button style={btn(true)} onClick={runQuery} disabled={running || !sql.trim()}>
            {running ? <><Spinner /> Running…</> : "▶  Run Query"}
          </button>

          {/* Results */}
          {queryResult && (
            <Panel>
              {queryResult.error ? (
                <div style={{ fontSize: 12, color: C.red }}>⚠ {queryResult.error}</div>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <Badge label="OK" color={C.green} />
                    <span style={{ fontSize: 11, color: C.muted }}>{queryResult.msg}</span>
                  </div>
                  {queryResult.rows.length > 0 ? (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ borderCollapse: "collapse", fontSize: 11, width: "100%" }}>
                        <thead>
                          <tr>
                            {Object.keys(queryResult.rows[0]).map((k) => (
                              <th key={k} style={{ textAlign: "left", color: C.muted, padding: "4px 10px", borderBottom: `1px solid ${C.border}`, fontFamily: "monospace", whiteSpace: "nowrap" }}>{k}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {queryResult.rows.map((row, ri) => (
                            <tr key={ri} style={{ borderBottom: `1px solid #1a2230` }}>
                              {Object.values(row).map((v, ci) => (
                                <td key={ci} style={{ padding: "5px 10px", color: v == null ? C.muted : C.fg, fontFamily: "monospace", whiteSpace: "nowrap", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {v == null ? "NULL" : typeof v === "object" ? JSON.stringify(v) : String(v)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: C.muted }}>{queryResult.msg || "No rows returned."}</div>
                  )}
                </>
              )}
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Queue Pane — real FIFO queue
// ─────────────────────────────────────────────────────────────────────────────

function QueuePane({ node, sv }: { node: QueueBlock; sv: number }) {
  void sv;
  const queue = getQueue(node.id);

  const [payload, setPayload] = useState(
    JSON.stringify({ event: "message.created", data: { id: 1, text: "Hello" }, timestamp: new Date().toISOString() }, null, 2)
  );
  const [publishing, setPublishing] = useState(false);
  const [consuming, setConsuming] = useState(false);
  const [consumed, setConsumed] = useState<{ ts: string; payload: string }[]>([]);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [, forceRender] = useState(0);

  const publish = useCallback(async () => {
    try { JSON.parse(payload); } catch { setJsonError("Invalid JSON"); return; }
    setJsonError(null);
    setPublishing(true);
    await wait(randMs(60, 250));
    const ts = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    queue.push({ payload, ts });
    bumpStore();
    forceRender((n) => n + 1);
    setPublishing(false);
  }, [payload, queue]);

  const consume = useCallback(async () => {
    if (!queue.length) return;
    setConsuming(true);
    await wait(randMs(60, 200));
    const msg = queue.shift();
    if (msg) setConsumed((prev) => [msg, ...prev].slice(0, 40));
    bumpStore();
    forceRender((n) => n + 1);
    setConsuming(false);
  }, [queue]);

  const DC: Record<string, string> = { at_least_once: C.green, at_most_once: C.amber, exactly_once: C.primary };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <NodeTitle label={node.label} desc={node.description}>
        <Badge label={node.delivery.replace(/_/g, " ")} color={DC[node.delivery] ?? C.primary} />
      </NodeTitle>

      {/* Queue status */}
      <div style={{ display: "flex", gap: 12, fontSize: 11, color: C.muted }}>
        <span style={{ color: queue.length > 0 ? C.amber : C.muted }}>
          Queued: <strong style={{ color: C.fg }}>{queue.length}</strong>
        </span>
        <span>Retry: {node.retry.maxAttempts}× {node.retry.backoff}</span>
        <span>DLQ: {node.deadLetter ? "on" : "off"}</span>
      </div>

      {/* Publish */}
      <div>
        <SLabel>Publish Message</SLabel>
        <textarea
          style={{ ...INPUT, minHeight: 110, resize: "vertical", fontFamily: "Menlo, Consolas, monospace" }}
          value={payload} onChange={(e) => setPayload(e.target.value)} spellCheck={false}
        />
        {jsonError && <div style={{ fontSize: 11, color: C.red, marginTop: 3 }}>{jsonError}</div>}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button style={btn(true)} onClick={publish} disabled={publishing}>
          {publishing ? <><Spinner /> Publishing…</> : "▶  Publish"}
        </button>
        <button style={{ ...btn(), opacity: queue.length === 0 ? 0.4 : 1 }} onClick={consume} disabled={consuming || queue.length === 0}>
          {consuming ? <><Spinner /> Consuming…</> : `⬇  Consume Next (${queue.length})`}
        </button>
      </div>

      {/* Pending queue */}
      {queue.length > 0 && (
        <Panel>
          <SLabel>Pending ({queue.length})</SLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 160, overflowY: "auto" }}>
            {queue.map((m, i) => (
              <div key={i} style={{ display: "flex", gap: 8, fontSize: 11 }}>
                <Badge label={`#${i + 1}`} color={C.amber} />
                <span style={{ color: C.muted }}>{m.ts}</span>
                <pre style={{ margin: 0, color: C.fg, fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
                  {m.payload.length > 80 ? m.payload.slice(0, 80) + "…" : m.payload}
                </pre>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Consumed log */}
      {consumed.length > 0 && (
        <Panel>
          <SLabel>Consumed ({consumed.length})</SLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto" }}>
            {consumed.map((m, i) => (
              <div key={i} style={{ display: "flex", gap: 8, fontSize: 11, borderBottom: `1px solid #1a2230`, paddingBottom: 5 }}>
                <span style={{ color: C.green, flexShrink: 0 }}>✓</span>
                <span style={{ color: C.muted, flexShrink: 0 }}>{m.ts}</span>
                <pre style={{ margin: 0, color: C.fg, fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-all", flex: 1 }}>
                  {m.payload.length > 120 ? m.payload.slice(0, 120) + "…" : m.payload}
                </pre>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Infra Pane
// ─────────────────────────────────────────────────────────────────────────────

function MetricBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
        <span style={{ color: C.muted }}>{label}</span>
        <span style={{ color: C.fg, fontWeight: 600 }}>{pct}%</span>
      </div>
      <div style={{ height: 6, background: C.bg, borderRadius: 999, overflow: "hidden", border: `1px solid ${C.border}` }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 999, transition: "width .4s ease" }} />
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
    ec2: C.amber, lambda: C.primary, eks: C.green, vpc: "#a78bfa",
    s3: C.amber, rds: C.primary, load_balancer: C.green, hpc: C.red,
  };
  const configEntries = Object.entries(config)
    .filter(([, v]) => v !== "" && v !== 0 && v !== false)
    .slice(0, 8);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <NodeTitle label={node.label} desc={node.description}>
        <Badge label={resourceType.toUpperCase()} color={RT_COLOR[resourceType] ?? C.primary} />
        <Badge label="Healthy" color={C.green} />
      </NodeTitle>
      <div style={{ display: "flex", gap: 12, fontSize: 11, color: C.muted }}>
        <span>{node.provider.toUpperCase()}</span><span>{node.region}</span><span>{node.environment}</span>
      </div>
      {configEntries.length > 0 && (
        <Panel>
          <SLabel>Configuration</SLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {configEntries.map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, gap: 12 }}>
                <span style={{ color: C.muted }}>{k}</span>
                <span style={{ color: C.fg, fontFamily: "monospace", textAlign: "right", maxWidth: 260, wordBreak: "break-all" }}>{String(v)}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}
      <Panel>
        <SLabel>Simulated Metrics</SLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <MetricBar label="CPU" pct={metrics.cpu} color={metrics.cpu > 80 ? C.red : metrics.cpu > 60 ? C.amber : C.green} />
          <MetricBar label="Memory" pct={metrics.mem} color={metrics.mem > 80 ? C.red : C.primary} />
          <MetricBar label="Disk" pct={metrics.disk} color={C.muted} />
          <MetricBar label="Network" pct={metrics.net} color={C.green} />
        </div>
      </Panel>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared pieces
// ─────────────────────────────────────────────────────────────────────────────

function NodeTitle({ label, desc, children }: { label: string; desc?: string; children?: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: C.fg }}>{label}</span>
        {children}
      </div>
      {desc && <div style={{ fontSize: 12, color: C.muted }}>{desc}</div>}
    </div>
  );
}

type TNode = { id: string; kind: string; label: string; data: NodeData };

function SidebarGroup({
  title, icon, items, selected, onSelect, sv,
}: {
  title: string; icon: string; items: TNode[];
  selected: string | null; onSelect: (id: string) => void; sv: number;
}) {
  void sv;
  if (!items.length) return null;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: "0.07em", textTransform: "uppercase", padding: "8px 14px 4px" }}>
        {icon}&nbsp;{title} ({items.length})
      </div>
      {items.map((n) => {
        const isActive = selected === n.id;
        const api = n.kind === "api_binding" ? (n.data as ApiBinding) : null;
        const dbNode = n.kind === "database" ? (n.data as DatabaseBlock) : null;
        const qNode = n.kind === "queue" ? (n.data as QueueBlock) : null;

        // Live record/queue counts for the sidebar
        let countLabel = "";
        if (api?.route) {
          const c = getTable(resourceName(api.route)).size();
          if (c > 0) countLabel = `${c}`;
        }
        if (dbNode) {
          const total = dbNode.tables.reduce((s, t) => s + getTable(t.name).size(), 0);
          if (total > 0) countLabel = `${total}`;
        }
        if (qNode) {
          const c = getQueue(n.id).length;
          if (c > 0) countLabel = `${c}`;
        }

        return (
          <button key={n.id} type="button" onClick={() => onSelect(n.id)} style={{
            width: "100%", textAlign: "left", border: "none",
            background: isActive ? `color-mix(in srgb, ${C.primary} 10%, ${C.float})` : "transparent",
            color: isActive ? C.fg : "#9aaccc",
            padding: "7px 14px", fontSize: 12, cursor: "pointer",
            display: "flex", flexDirection: "column", gap: 2,
            borderLeft: `2px solid ${isActive ? C.primary : "transparent"}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontWeight: isActive ? 600 : 400 }}>
                {api?.method && (
                  <span style={{ color: MC[api.method] ?? C.primary, fontFamily: "monospace", fontSize: 10, marginRight: 5, fontWeight: 700 }}>
                    {api.method}
                  </span>
                )}
                {n.label}
              </span>
              {countLabel && (
                <span style={{ fontSize: 10, color: C.green, background: `color-mix(in srgb, ${C.green} 15%, ${C.float})`, borderRadius: 4, padding: "1px 5px" }}>
                  {countLabel}
                </span>
              )}
            </div>
            {api?.route && <span style={{ fontSize: 10, color: C.muted, fontFamily: "monospace" }}>{api.route}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

export function TestPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const graphs = useStore((s) => s.graphs);
  // Re-render whenever the store changes (inserts, deletes, etc.)
  const [sv, setSv] = useState(_storeVersion);
  useEffect(() => {
    const id = setInterval(() => {
      if (_storeVersion !== sv) setSv(_storeVersion);
    }, 120);
    return () => clearInterval(id);
  }, [sv]);

  const nodes = useMemo<TNode[]>(
    () =>
      (Object.values(graphs).flatMap((g) => g.nodes) as Node[])
        .filter((n) => {
          const d = n.data as { kind?: string };
          return typeof d?.kind === "string" && d.kind !== "service_boundary";
        })
        .map((n) => ({
          id: n.id,
          kind: (n.data as { kind: string }).kind,
          label: (n.data as { kind: string; label?: string }).label ?? n.id,
          data: n.data as NodeData,
        })),
    [graphs]
  );

  const groups = useMemo(() => ({
    apis: nodes.filter((n) => n.kind === "api_binding"),
    functions: nodes.filter((n) => n.kind === "process"),
    databases: nodes.filter((n) => n.kind === "database"),
    queues: nodes.filter((n) => n.kind === "queue"),
    infra: nodes.filter((n) => n.kind === "infra"),
  }), [nodes]);

  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (nodes.length > 0 && (!selected || !nodes.find((n) => n.id === selected))) {
      setSelected(nodes[0].id);
    }
  }, [isOpen, nodes]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeNode = nodes.find((n) => n.id === selected) ?? null;
  const isEmpty = nodes.length === 0;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      display: isOpen ? "flex" : "none",
      flexDirection: "column", background: C.bg,
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 18px", minHeight: 48,
        borderBottom: `1px solid ${C.border}`,
        background: `color-mix(in srgb, ${C.panel} 94%, #0c111a 6%)`,
        flexShrink: 0, gap: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.green, boxShadow: `0 0 8px ${C.green}88` }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: C.fg }}>Test Environment</span>
          <span style={{ fontSize: 11, color: C.muted }}>
            {nodes.length} component{nodes.length !== 1 ? "s" : ""} · data persists while panel is open
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" style={{ ...btn(false, true), fontSize: 11, padding: "5px 10px" }}
            onClick={() => { resetAll(); setSv(_storeVersion); }}>
            Reset all data
          </button>
          <button type="button" style={btn()} onClick={onClose}>✕ Close</button>
        </div>
      </div>

      {/* Body */}
      {isEmpty ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.fg }}>No components to test</div>
          <div style={{ fontSize: 12, color: C.muted }}>Add API, Function, Database, Queue, or Infrastructure nodes to your canvas.</div>
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Sidebar */}
          <div style={{ width: 240, flexShrink: 0, borderRight: `1px solid ${C.border}`, background: C.bg, overflowY: "auto", paddingTop: 8, paddingBottom: 16 }}>
            <SidebarGroup title="APIs" icon="⬡" items={groups.apis} selected={selected} onSelect={setSelected} sv={sv} />
            <SidebarGroup title="Functions" icon="⚡" items={groups.functions} selected={selected} onSelect={setSelected} sv={sv} />
            <SidebarGroup title="Databases" icon="◈" items={groups.databases} selected={selected} onSelect={setSelected} sv={sv} />
            <SidebarGroup title="Queues" icon="⇌" items={groups.queues} selected={selected} onSelect={setSelected} sv={sv} />
            <SidebarGroup title="Infrastructure" icon="⬜" items={groups.infra} selected={selected} onSelect={setSelected} sv={sv} />
          </div>

          {/* Main content */}
          <div style={{ flex: 1, overflowY: "auto", padding: 28, maxWidth: 780 }}>
            {activeNode ? (
              <React.Fragment key={activeNode.id}>
                {activeNode.kind === "api_binding" && <ApiPane node={activeNode.data as ApiBinding} sv={sv} />}
                {activeNode.kind === "process" && <FunctionPane node={activeNode.data as ProcessDefinition} />}
                {activeNode.kind === "database" && <DatabasePane node={activeNode.data as DatabaseBlock} sv={sv} />}
                {activeNode.kind === "queue" && <QueuePane node={activeNode.data as QueueBlock} sv={sv} />}
                {activeNode.kind === "infra" && <InfraPane node={activeNode.data as InfraBlock} />}
              </React.Fragment>
            ) : (
              <div style={{ fontSize: 12, color: C.muted }}>Select a component from the sidebar.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
