/**
 * In-memory test environment backend.
 *
 * Provides a singleton MemTable store, a lightweight SQL executor, and a
 * REST-style CRUD handler — all running entirely in-browser memory so users
 * can interactively test their canvas designs without a real server.
 *
 * Exported as pure functions / classes so they can be unit-tested in Node.js.
 */

// ─────────────────────────────────────────────────────────────────────────────
// MemTable — per-resource in-memory table
// ─────────────────────────────────────────────────────────────────────────────

export type Row = Record<string, unknown>;

export class MemTable {
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
    const existing = this.rows.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...patch, id };
    this.rows.set(id, updated);
    return updated;
  }

  delete(id: string): boolean { return this.rows.delete(id); }

  clear() { this.rows.clear(); this.seq = 1; }

  size() { return this.rows.size; }

  filter(fn: (r: Row) => boolean): Row[] { return this.all().filter(fn); }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton store (module-level — survives React panel open/close)
// ─────────────────────────────────────────────────────────────────────────────

export const _db = new Map<string, MemTable>();

export function getTable(name: string): MemTable {
  const k = name.toLowerCase().trim();
  if (!_db.has(k)) _db.set(k, new MemTable());
  return _db.get(k)!;
}

export const _queues = new Map<string, { payload: string; ts: string }[]>();

export function getQueue(id: string) {
  if (!_queues.has(id)) _queues.set(id, []);
  return _queues.get(id)!;
}

/** Increment to signal React components that the store changed. */
export let _storeVersion = 0;
export function bumpStore() { _storeVersion++; }
export function getStoreVersion(): number { return _storeVersion; }

export function resetAll() {
  _db.forEach((t) => t.clear());
  _queues.forEach((q) => { q.length = 0; });
  bumpStore();
}

// ─────────────────────────────────────────────────────────────────────────────
// SQL executor — SELECT / INSERT / UPDATE / DELETE
// ─────────────────────────────────────────────────────────────────────────────

export function parseVal(s: string): unknown {
  s = s.trim();
  if (new RegExp("^'.*'$", "s").test(s) || new RegExp('^".*"$', "s").test(s))
    return s.slice(1, -1);
  if (s.toLowerCase() === "null")  return null;
  if (s.toLowerCase() === "true")  return true;
  if (s.toLowerCase() === "false") return false;
  const n = Number(s);
  return isNaN(n) ? s : n;
}

export function parseValueList(raw: string): unknown[] {
  const out: unknown[] = [];
  let cur = "", inStr = false, q = "";
  for (const ch of raw) {
    if (!inStr && (ch === "'" || ch === '"')) { inStr = true; q = ch; cur += ch; }
    else if (inStr && ch === q)              { inStr = false; cur += ch; }
    else if (!inStr && ch === ",")           { out.push(parseVal(cur.trim())); cur = ""; }
    else cur += ch;
  }
  if (cur.trim()) out.push(parseVal(cur.trim()));
  return out;
}

export function matches(row: Row, where: string): boolean {
  return where.split(/\s+AND\s+/i).every((part) => {
    const m = part.trim().match(
      /(\w+)\s*(=|!=|<>|>=|<=|>|<|LIKE|IS\s+NOT\s+NULL|IS\s+NULL)\s*(.*)/i,
    );
    if (!m) return true;
    const [, col, rawOp, rawVal] = m;
    const op = rawOp.trim().toUpperCase().replace(/\s+/g, " ");
    const rv = row[col];
    const val = parseVal(rawVal.trim());
    if (op === "IS NULL")     return rv == null;
    if (op === "IS NOT NULL") return rv != null;
    if (op === "=")           return String(rv) === String(val);
    if (op === "!=" || op === "<>") return String(rv) !== String(val);
    if (op === ">")  return Number(rv) > Number(val);
    if (op === "<")  return Number(rv) < Number(val);
    if (op === ">=") return Number(rv) >= Number(val);
    if (op === "<=") return Number(rv) <= Number(val);
    if (op === "LIKE")
      return String(rv).toLowerCase().includes(
        String(val).toLowerCase().replace(/%/g, ""),
      );
    return true;
  });
}

export type SQLResult = {
  rows: Row[];
  affected: number;
  msg: string;
  error?: string;
};

export function execSQL(rawSQL: string): SQLResult {
  const sql = rawSQL.trim().replace(/;+$/, "").trim();
  const kw = sql.split(/\s+/)[0]?.toUpperCase();
  try {
    // ── SELECT ────────────────────────────────────────────────────────────
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

    // ── INSERT ────────────────────────────────────────────────────────────
    if (kw === "INSERT") {
      const m = sql.match(
        /INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i,
      );
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

    // ── UPDATE ────────────────────────────────────────────────────────────
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

    // ── DELETE ────────────────────────────────────────────────────────────
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
    return {
      rows: [],
      affected: 0,
      msg: "",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REST CRUD helper
// ─────────────────────────────────────────────────────────────────────────────

export function resourceName(route = ""): string {
  const segs = route.split("/").filter(Boolean);
  const meaningful = segs.filter(
    (s) => !s.startsWith(":") && !s.startsWith("{") && s !== "api" && !/^v\d+$/.test(s),
  );
  return (meaningful[meaningful.length - 1] ?? "records").toLowerCase();
}

export function extractId(
  route: string,
  pathVals: Record<string, string>,
): string | null {
  for (const seg of route.split("/")) {
    if (seg.startsWith(":")) return pathVals[seg.slice(1)] ?? null;
    if (seg.startsWith("{") && seg.endsWith("}"))
      return pathVals[seg.slice(1, -1)] ?? null;
  }
  return null;
}

export function coerce(v: string): unknown {
  if (v === "") return "";
  if (v === "true")  return true;
  if (v === "false") return false;
  if (!isNaN(Number(v)) && v.trim() !== "") return Number(v);
  return v;
}

export function handleApiRequest(
  method: string,
  route: string,
  pathVals: Record<string, string>,
  queryVals: Record<string, string>,
  bodyVals: Record<string, string>,
): { status: number; body: unknown } {
  const res = resourceName(route);
  const id  = extractId(route, pathVals);

  if (method === "GET") {
    if (id) {
      const row = getTable(res).byId(id);
      return row
        ? { status: 200, body: row }
        : { status: 404, body: { error: "Not found", id } };
    }
    const allRows = getTable(res).all();
    const filtered = Object.keys(queryVals).length
      ? allRows.filter((r) =>
          Object.entries(queryVals).every(([k, v]) => v === "" || String(r[k]) === v),
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
