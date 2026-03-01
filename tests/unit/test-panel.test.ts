/**
 * Unit tests for the TestPanel in-memory backend (lib/test-env/store.ts).
 *
 * Tests cover:
 *  - MemTable CRUD (insert, all, byId, update, delete, filter, size, clear)
 *  - SQL executor  (SELECT, INSERT, UPDATE, DELETE + WHERE / ORDER BY / LIMIT)
 *  - REST CRUD handler (GET list, GET by ID, POST, PUT, PATCH, DELETE)
 *  - Helper utilities (resourceName, extractId, coerce, parseVal)
 *  - Store-level helpers (resetAll, bumpStore, getStoreVersion)
 *
 * Every test group calls resetAll() in beforeEach so tests are fully isolated.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  MemTable,
  getTable,
  getQueue,
  resetAll,
  bumpStore,
  getStoreVersion,
  parseVal,
  parseValueList,
  matches,
  execSQL,
  resourceName,
  extractId,
  coerce,
  handleApiRequest,
} from "@/lib/test-env/store";

// ─────────────────────────────────────────────────────────────────────────────
// MemTable
// ─────────────────────────────────────────────────────────────────────────────

describe("MemTable", () => {
  let tbl: MemTable;

  beforeEach(() => {
    tbl = new MemTable();
  });

  it("inserts a row and auto-assigns an id", () => {
    const row = tbl.insert({ name: "Alice" });
    expect(row.id).toBeDefined();
    expect(row.name).toBe("Alice");
  });

  it("respects an explicit id provided in the row", () => {
    const row = tbl.insert({ id: "abc", name: "Bob" });
    expect(row.id).toBe("abc");
  });

  it("auto-increments id for subsequent rows without explicit ids", () => {
    const r1 = tbl.insert({ x: 1 });
    const r2 = tbl.insert({ x: 2 });
    expect(r1.id).toBe("1");
    expect(r2.id).toBe("2");
  });

  it("all() returns every inserted row", () => {
    tbl.insert({ a: 1 });
    tbl.insert({ a: 2 });
    expect(tbl.all()).toHaveLength(2);
  });

  it("all() returns empty array when no rows", () => {
    expect(tbl.all()).toEqual([]);
  });

  it("byId() returns the correct row", () => {
    const r = tbl.insert({ name: "Carol" });
    expect(tbl.byId(r.id as string)).toEqual(r);
  });

  it("byId() returns null for an unknown id", () => {
    expect(tbl.byId("nope")).toBeNull();
  });

  it("update() merges patch into the row", () => {
    const r = tbl.insert({ name: "Dan", age: 30 });
    const updated = tbl.update(r.id as string, { age: 31 });
    expect(updated?.age).toBe(31);
    expect(updated?.name).toBe("Dan");
  });

  it("update() preserves the original id", () => {
    const r = tbl.insert({ name: "Eve" });
    const updated = tbl.update(r.id as string, { name: "Eve Updated" });
    expect(updated?.id).toBe(r.id);
  });

  it("update() returns null for unknown id", () => {
    expect(tbl.update("missing", { x: 1 })).toBeNull();
  });

  it("delete() removes the row and returns true", () => {
    const r = tbl.insert({ k: "v" });
    expect(tbl.delete(r.id as string)).toBe(true);
    expect(tbl.byId(r.id as string)).toBeNull();
  });

  it("delete() returns false for an unknown id", () => {
    expect(tbl.delete("ghost")).toBe(false);
  });

  it("size() reflects the current row count", () => {
    expect(tbl.size()).toBe(0);
    tbl.insert({});
    tbl.insert({});
    expect(tbl.size()).toBe(2);
    tbl.delete("1");
    expect(tbl.size()).toBe(1);
  });

  it("clear() empties the table and resets the sequence", () => {
    tbl.insert({ x: 1 });
    tbl.clear();
    expect(tbl.size()).toBe(0);
    // Sequence resets → next auto-id is "1" again
    expect(tbl.insert({}).id).toBe("1");
  });

  it("filter() returns only matching rows", () => {
    tbl.insert({ role: "admin" });
    tbl.insert({ role: "user" });
    tbl.insert({ role: "user" });
    const admins = tbl.filter((r) => r.role === "admin");
    expect(admins).toHaveLength(1);
    expect(admins[0].role).toBe("admin");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Store helpers
// ─────────────────────────────────────────────────────────────────────────────

describe("store helpers", () => {
  beforeEach(() => resetAll());

  it("bumpStore increments the version", () => {
    const before = getStoreVersion();
    bumpStore();
    expect(getStoreVersion()).toBe(before + 1);
  });

  it("resetAll clears all tables and queues", () => {
    getTable("users").insert({ name: "Alice" });
    getQueue("q1").push({ payload: "{}", ts: "now" });
    resetAll();
    expect(getTable("users").size()).toBe(0);
    expect(getQueue("q1").length).toBe(0);
  });

  it("getTable returns the same instance for the same name", () => {
    expect(getTable("items")).toBe(getTable("items"));
  });

  it("getTable treats names case-insensitively", () => {
    expect(getTable("Users")).toBe(getTable("users"));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseVal
// ─────────────────────────────────────────────────────────────────────────────

describe("parseVal", () => {
  it("strips single-quoted strings", () => {
    expect(parseVal("'hello'")).toBe("hello");
  });

  it("strips double-quoted strings", () => {
    expect(parseVal('"world"')).toBe("world");
  });

  it("parses null literal", () => {
    expect(parseVal("null")).toBeNull();
    expect(parseVal("NULL")).toBeNull();
  });

  it("parses boolean literals", () => {
    expect(parseVal("true")).toBe(true);
    expect(parseVal("false")).toBe(false);
    expect(parseVal("TRUE")).toBe(true);
  });

  it("parses numeric strings as numbers", () => {
    expect(parseVal("42")).toBe(42);
    expect(parseVal("3.14")).toBeCloseTo(3.14);
    expect(parseVal("-7")).toBe(-7);
  });

  it("returns unquoted non-numeric strings as-is", () => {
    expect(parseVal("active")).toBe("active");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseValueList
// ─────────────────────────────────────────────────────────────────────────────

describe("parseValueList", () => {
  it("splits a simple comma-separated list", () => {
    expect(parseValueList("1, 2, 3")).toEqual([1, 2, 3]);
  });

  it("handles quoted strings with commas inside them", () => {
    const result = parseValueList("'hello, world', 42");
    expect(result).toEqual(["hello, world", 42]);
  });

  it("handles mixed types", () => {
    const result = parseValueList("'Alice', 30, true, null");
    expect(result).toEqual(["Alice", 30, true, null]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// matches (WHERE clause evaluation)
// ─────────────────────────────────────────────────────────────────────────────

describe("matches", () => {
  const row = { id: "1", name: "Alice", age: 30, role: "admin", active: true };

  it("= equality check", () => {
    expect(matches(row, "role = 'admin'")).toBe(true);
    expect(matches(row, "role = 'user'")).toBe(false);
  });

  it("!= inequality check", () => {
    expect(matches(row, "role != 'user'")).toBe(true);
  });

  it("<> inequality check", () => {
    expect(matches(row, "role <> 'admin'")).toBe(false);
  });

  it("> and < numeric comparisons", () => {
    expect(matches(row, "age > 20")).toBe(true);
    expect(matches(row, "age < 20")).toBe(false);
    expect(matches(row, "age >= 30")).toBe(true);
    expect(matches(row, "age <= 30")).toBe(true);
  });

  it("LIKE substring match", () => {
    expect(matches(row, "name LIKE '%lic%'")).toBe(true);
    expect(matches(row, "name LIKE 'Alice'")).toBe(true);
    expect(matches(row, "name LIKE '%bob%'")).toBe(false);
  });

  it("IS NULL / IS NOT NULL", () => {
    const sparse = { id: "2", name: null };
    expect(matches(sparse, "name IS NULL")).toBe(true);
    expect(matches(sparse, "name IS NOT NULL")).toBe(false);
    expect(matches(row, "name IS NOT NULL")).toBe(true);
  });

  it("AND combining multiple conditions", () => {
    expect(matches(row, "role = 'admin' AND age > 20")).toBe(true);
    expect(matches(row, "role = 'admin' AND age > 50")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// execSQL
// ─────────────────────────────────────────────────────────────────────────────

describe("execSQL", () => {
  beforeEach(() => resetAll());

  // Seed helper
  function seed() {
    execSQL("INSERT INTO users (name, age, role) VALUES ('Alice', 30, 'admin')");
    execSQL("INSERT INTO users (name, age, role) VALUES ('Bob', 25, 'user')");
    execSQL("INSERT INTO users (name, age, role) VALUES ('Carol', 35, 'user')");
  }

  // ── SELECT ──────────────────────────────────────────────────────────────
  it("SELECT * returns all rows", () => {
    seed();
    const r = execSQL("SELECT * FROM users");
    expect(r.error).toBeUndefined();
    expect(r.rows).toHaveLength(3);
  });

  it("SELECT with WHERE filters rows", () => {
    seed();
    const r = execSQL("SELECT * FROM users WHERE role = 'admin'");
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].name).toBe("Alice");
  });

  it("SELECT from empty table returns empty array", () => {
    const r = execSQL("SELECT * FROM empty_table");
    expect(r.rows).toEqual([]);
    expect(r.affected).toBe(0);
  });

  it("SELECT with LIMIT truncates results", () => {
    seed();
    const r = execSQL("SELECT * FROM users LIMIT 2");
    expect(r.rows).toHaveLength(2);
  });

  it("SELECT with ORDER BY ASC sorts correctly", () => {
    seed();
    const r = execSQL("SELECT * FROM users ORDER BY name ASC");
    const names = r.rows.map((row) => row.name);
    expect(names).toEqual(["Alice", "Bob", "Carol"]);
  });

  it("SELECT with ORDER BY DESC sorts correctly", () => {
    seed();
    const r = execSQL("SELECT * FROM users ORDER BY name DESC");
    const names = r.rows.map((row) => row.name);
    expect(names).toEqual(["Carol", "Bob", "Alice"]);
  });

  it("SELECT with compound WHERE (AND) works", () => {
    seed();
    const r = execSQL("SELECT * FROM users WHERE role = 'user' AND age > 30");
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].name).toBe("Carol");
  });

  it("SELECT missing FROM clause returns error", () => {
    const r = execSQL("SELECT *");
    expect(r.error).toBeDefined();
  });

  it("SELECT with trailing semicolon works", () => {
    seed();
    const r = execSQL("SELECT * FROM users;");
    expect(r.error).toBeUndefined();
    expect(r.rows).toHaveLength(3);
  });

  // ── INSERT ──────────────────────────────────────────────────────────────
  it("INSERT adds a row and returns it", () => {
    const r = execSQL("INSERT INTO products (name, price) VALUES ('Widget', 9.99)");
    expect(r.error).toBeUndefined();
    expect(r.affected).toBe(1);
    expect(r.rows[0].name).toBe("Widget");
    expect(r.rows[0].price).toBe(9.99);
  });

  it("INSERT with explicit id respects the id", () => {
    execSQL("INSERT INTO items (id, label) VALUES ('item-1', 'First')");
    const tbl = getTable("items");
    expect(tbl.byId("item-1")).not.toBeNull();
  });

  it("INSERT persists so SELECT can retrieve it", () => {
    execSQL("INSERT INTO orders (product, qty) VALUES ('Apple', 3)");
    const r = execSQL("SELECT * FROM orders");
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].product).toBe("Apple");
  });

  it("INSERT column/value count mismatch returns error", () => {
    const r = execSQL("INSERT INTO t (a, b) VALUES (1)");
    expect(r.error).toMatch(/columns vs/);
  });

  it("INSERT bad syntax returns error", () => {
    const r = execSQL("INSERT INTO t VALUES (1,2,3)");
    expect(r.error).toBeDefined();
  });

  // ── UPDATE ──────────────────────────────────────────────────────────────
  it("UPDATE modifies matching rows", () => {
    seed();
    const upd = execSQL("UPDATE users SET role = 'moderator' WHERE name = 'Bob'");
    expect(upd.error).toBeUndefined();
    expect(upd.affected).toBe(1);
    const sel = execSQL("SELECT * FROM users WHERE role = 'moderator'");
    expect(sel.rows[0].name).toBe("Bob");
  });

  it("UPDATE without WHERE updates all rows", () => {
    seed();
    const upd = execSQL("UPDATE users SET role = 'guest'");
    expect(upd.affected).toBe(3);
  });

  it("UPDATE preserves non-patched fields", () => {
    seed();
    execSQL("UPDATE users SET age = 99 WHERE name = 'Alice'");
    const sel = execSQL("SELECT * FROM users WHERE name = 'Alice'");
    expect(sel.rows[0].role).toBe("admin"); // unchanged
    expect(sel.rows[0].age).toBe(99);
  });

  // ── DELETE ──────────────────────────────────────────────────────────────
  it("DELETE with WHERE removes matching rows", () => {
    seed();
    const del = execSQL("DELETE FROM users WHERE role = 'user'");
    expect(del.error).toBeUndefined();
    expect(del.affected).toBe(2);
    const sel = execSQL("SELECT * FROM users");
    expect(sel.rows).toHaveLength(1);
  });

  it("DELETE without WHERE clears the whole table", () => {
    seed();
    const del = execSQL("DELETE FROM users");
    expect(del.affected).toBe(3);
    expect(getTable("users").size()).toBe(0);
  });

  it("DELETE from empty table gives 0 affected", () => {
    const del = execSQL("DELETE FROM nodata WHERE id = '1'");
    expect(del.affected).toBe(0);
    expect(del.error).toBeUndefined();
  });

  // ── Unsupported ──────────────────────────────────────────────────────────
  it("unsupported statement (CREATE) returns error", () => {
    const r = execSQL("CREATE TABLE foo (id INT)");
    expect(r.error).toMatch(/Unsupported/i);
  });

  it("empty string returns error (unsupported)", () => {
    const r = execSQL("   ");
    expect(r.error).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resourceName
// ─────────────────────────────────────────────────────────────────────────────

describe("resourceName", () => {
  it("/api/users → users", () => expect(resourceName("/api/users")).toBe("users"));
  it("/api/v1/users → users", () => expect(resourceName("/api/v1/users")).toBe("users"));
  it("/api/users/:id → users", () => expect(resourceName("/api/users/:id")).toBe("users"));
  it("/users/:id → users", () => expect(resourceName("/users/:id")).toBe("users"));
  it("/api/v2/orders/:orderId/items → items", () =>
    expect(resourceName("/api/v2/orders/:orderId/items")).toBe("items"));
  it("empty route → records", () => expect(resourceName("")).toBe("records"));
  it("/ → records", () => expect(resourceName("/")).toBe("records"));
});

// ─────────────────────────────────────────────────────────────────────────────
// extractId
// ─────────────────────────────────────────────────────────────────────────────

describe("extractId", () => {
  it("extracts :id style path param", () => {
    expect(extractId("/users/:id", { id: "42" })).toBe("42");
  });

  it("extracts {id} style path param", () => {
    expect(extractId("/users/{userId}", { userId: "99" })).toBe("99");
  });

  it("returns null if param not in pathVals", () => {
    expect(extractId("/users/:id", {})).toBeNull();
  });

  it("returns null when route has no param segment", () => {
    expect(extractId("/users", { id: "1" })).toBeNull();
  });

  it("uses the first param segment found", () => {
    // /users/:userId/posts/:postId → should return userId value
    expect(extractId("/users/:userId/posts/:postId", { userId: "u1", postId: "p1" })).toBe("u1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// coerce
// ─────────────────────────────────────────────────────────────────────────────

describe("coerce", () => {
  it("coerces 'true' to boolean true",  () => expect(coerce("true")).toBe(true));
  it("coerces 'false' to boolean false", () => expect(coerce("false")).toBe(false));
  it("coerces numeric strings to numbers", () => expect(coerce("42")).toBe(42));
  it("coerces '3.14' to number",         () => expect(coerce("3.14")).toBeCloseTo(3.14));
  it("keeps empty string as empty string", () => expect(coerce("")).toBe(""));
  it("keeps non-numeric strings as strings", () => expect(coerce("hello")).toBe("hello"));
  it("keeps '0' as number 0",            () => expect(coerce("0")).toBe(0));
});

// ─────────────────────────────────────────────────────────────────────────────
// handleApiRequest — GET
// ─────────────────────────────────────────────────────────────────────────────

describe("handleApiRequest – GET", () => {
  beforeEach(() => resetAll());

  it("GET /api/users returns empty array when no data", () => {
    const { status, body } = handleApiRequest("GET", "/api/users", {}, {}, {});
    expect(status).toBe(200);
    expect(body).toEqual([]);
  });

  it("GET /api/users returns all inserted rows", () => {
    getTable("users").insert({ name: "Alice" });
    getTable("users").insert({ name: "Bob" });
    const { status, body } = handleApiRequest("GET", "/api/users", {}, {}, {});
    expect(status).toBe(200);
    expect((body as unknown[]).length).toBe(2);
  });

  it("GET /api/users/:id returns the row when found", () => {
    const row = getTable("users").insert({ name: "Carol" });
    const { status, body } = handleApiRequest(
      "GET", "/api/users/:id", { id: row.id as string }, {}, {}
    );
    expect(status).toBe(200);
    expect((body as { name: string }).name).toBe("Carol");
  });

  it("GET /api/users/:id returns 404 when not found", () => {
    const { status } = handleApiRequest("GET", "/api/users/:id", { id: "999" }, {}, {});
    expect(status).toBe(404);
  });

  it("GET with query filter limits results", () => {
    getTable("items").insert({ status: "active" });
    getTable("items").insert({ status: "inactive" });
    getTable("items").insert({ status: "active" });
    const { status, body } = handleApiRequest("GET", "/api/items", {}, { status: "active" }, {});
    expect(status).toBe(200);
    expect((body as unknown[]).length).toBe(2);
  });

  it("GET with empty-string query value matches all", () => {
    getTable("items").insert({ status: "active" });
    getTable("items").insert({ status: "inactive" });
    const { body } = handleApiRequest("GET", "/api/items", {}, { status: "" }, {});
    expect((body as unknown[]).length).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleApiRequest — POST
// ─────────────────────────────────────────────────────────────────────────────

describe("handleApiRequest – POST", () => {
  beforeEach(() => resetAll());

  it("POST creates a new row and returns 201", () => {
    const { status, body } = handleApiRequest(
      "POST", "/api/users", {}, {}, { name: "Dave", age: "28" }
    );
    expect(status).toBe(201);
    expect((body as { name: string }).name).toBe("Dave");
    expect((body as { age: number }).age).toBe(28); // coerced to number
  });

  it("POST-ed row is retrievable via GET", () => {
    handleApiRequest("POST", "/api/products", {}, {}, { title: "Widget", price: "9.99" });
    const { body } = handleApiRequest("GET", "/api/products", {}, {}, {});
    expect((body as unknown[]).length).toBe(1);
  });

  it("POST auto-assigns an id", () => {
    const { body } = handleApiRequest("POST", "/api/notes", {}, {}, { text: "hello" });
    expect((body as { id: string }).id).toBeDefined();
  });

  it("POST with explicit id respects it", () => {
    const { body } = handleApiRequest(
      "POST", "/api/notes", {}, {}, { id: "custom-1", text: "hi" }
    );
    expect((body as { id: string }).id).toBe("custom-1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleApiRequest — PUT / PATCH
// ─────────────────────────────────────────────────────────────────────────────

describe("handleApiRequest – PUT / PATCH", () => {
  beforeEach(() => resetAll());

  it("PUT updates an existing row and returns 200", () => {
    const row = getTable("users").insert({ name: "Eve", role: "user" });
    const { status, body } = handleApiRequest(
      "PUT", "/api/users/:id", { id: row.id as string }, {}, { role: "admin" }
    );
    expect(status).toBe(200);
    expect((body as { role: string }).role).toBe("admin");
    expect((body as { name: string }).name).toBe("Eve"); // unchanged
  });

  it("PATCH updates an existing row and returns 200", () => {
    const row = getTable("items").insert({ label: "Old" });
    const { status } = handleApiRequest(
      "PATCH", "/api/items/:id", { id: row.id as string }, {}, { label: "New" }
    );
    expect(status).toBe(200);
  });

  it("PUT missing id returns 400", () => {
    const { status } = handleApiRequest("PUT", "/api/users", {}, {}, { role: "admin" });
    expect(status).toBe(400);
  });

  it("PUT with unknown id upserts (creates) the row returning 201", () => {
    const { status } = handleApiRequest(
      "PUT", "/api/users/:id", { id: "new-99" }, {}, { name: "Ghost" }
    );
    expect(status).toBe(201);
    expect(getTable("users").byId("new-99")).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleApiRequest — DELETE
// ─────────────────────────────────────────────────────────────────────────────

describe("handleApiRequest – DELETE", () => {
  beforeEach(() => resetAll());

  it("DELETE removes an existing row and returns 200", () => {
    const row = getTable("posts").insert({ title: "Hello" });
    const { status, body } = handleApiRequest(
      "DELETE", "/api/posts/:id", { id: row.id as string }, {}, {}
    );
    expect(status).toBe(200);
    expect((body as { message: string }).message).toBe("Deleted");
    expect(getTable("posts").byId(row.id as string)).toBeNull();
  });

  it("DELETE unknown id returns 404", () => {
    const { status } = handleApiRequest("DELETE", "/api/posts/:id", { id: "999" }, {}, {});
    expect(status).toBe(404);
  });

  it("DELETE without an id in route/body returns 400", () => {
    const { status } = handleApiRequest("DELETE", "/api/posts", {}, {}, {});
    expect(status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleApiRequest — unsupported method
// ─────────────────────────────────────────────────────────────────────────────

describe("handleApiRequest – unsupported methods", () => {
  it("OPTIONS returns 405", () => {
    const { status } = handleApiRequest("OPTIONS", "/api/users", {}, {}, {});
    expect(status).toBe(405);
  });

  it("HEAD returns 405", () => {
    const { status } = handleApiRequest("HEAD", "/api/users", {}, {}, {});
    expect(status).toBe(405);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Queue helpers
// ─────────────────────────────────────────────────────────────────────────────

describe("getQueue", () => {
  beforeEach(() => resetAll());

  it("returns empty array for a new queue id", () => {
    expect(getQueue("q-new")).toEqual([]);
  });

  it("returns the same queue instance for the same id", () => {
    expect(getQueue("q1")).toBe(getQueue("q1"));
  });

  it("can push and shift items like a real FIFO queue", () => {
    const q = getQueue("fifo");
    q.push({ payload: '{"a":1}', ts: "t1" });
    q.push({ payload: '{"a":2}', ts: "t2" });
    expect(q.length).toBe(2);
    const first = q.shift();
    expect(first?.payload).toBe('{"a":1}');
    expect(q.length).toBe(1);
  });

  it("resetAll empties the queue", () => {
    getQueue("q2").push({ payload: "x", ts: "t" });
    resetAll();
    expect(getQueue("q2").length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// End-to-end: POST → GET round-trip through handleApiRequest
// ─────────────────────────────────────────────────────────────────────────────

describe("round-trip: POST then GET", () => {
  beforeEach(() => resetAll());

  it("data inserted via POST is returned by GET", () => {
    handleApiRequest("POST", "/api/users", {}, {}, { name: "Frank", role: "user" });
    handleApiRequest("POST", "/api/users", {}, {}, { name: "Grace", role: "admin" });

    const { body } = handleApiRequest("GET", "/api/users", {}, {}, {});
    expect((body as unknown[]).length).toBe(2);
  });

  it("data inserted via POST is retrievable by id", () => {
    const { body: created } = handleApiRequest(
      "POST", "/api/users", {}, {}, { id: "u1", name: "Heidi" }
    );
    const id = (created as { id: string }).id;
    const { body: fetched } = handleApiRequest("GET", "/api/users/:id", { id }, {}, {});
    expect((fetched as { name: string }).name).toBe("Heidi");
  });

  it("POST → PUT → GET reflects the update", () => {
    const { body: created } = handleApiRequest(
      "POST", "/api/todos", {}, {}, { title: "Buy milk", done: "false" }
    );
    const id = (created as { id: string }).id;
    handleApiRequest("PUT", "/api/todos/:id", { id }, {}, { done: "true" });
    const { body: fetched } = handleApiRequest("GET", "/api/todos/:id", { id }, {}, {});
    expect((fetched as { done: boolean }).done).toBe(true);
  });

  it("POST → DELETE → GET returns 404", () => {
    const { body: created } = handleApiRequest(
      "POST", "/api/files", {}, {}, { name: "test.txt" }
    );
    const id = (created as { id: string }).id;
    handleApiRequest("DELETE", "/api/files/:id", { id }, {}, {});
    const { status } = handleApiRequest("GET", "/api/files/:id", { id }, {}, {});
    expect(status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SQL ↔ API cross-interaction (same underlying MemTable)
// ─────────────────────────────────────────────────────────────────────────────

describe("SQL and API share the same MemTable", () => {
  beforeEach(() => resetAll());

  it("rows inserted via SQL are visible through GET", () => {
    execSQL("INSERT INTO widgets (name, price) VALUES ('Gadget', 19.99)");
    const { body } = handleApiRequest("GET", "/api/widgets", {}, {}, {});
    expect((body as unknown[]).length).toBe(1);
  });

  it("rows inserted via POST are queryable by SQL", () => {
    handleApiRequest("POST", "/api/widgets", {}, {}, { name: "Doohickey", price: "5.00" });
    const r = execSQL("SELECT * FROM widgets WHERE name = 'Doohickey'");
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].price).toBe(5);
  });

  it("DELETE via SQL removes rows fetched via GET", () => {
    execSQL("INSERT INTO widgets (name) VALUES ('A')");
    execSQL("INSERT INTO widgets (name) VALUES ('B')");
    execSQL("DELETE FROM widgets WHERE name = 'A'");
    const { body } = handleApiRequest("GET", "/api/widgets", {}, {}, {});
    expect((body as unknown[]).length).toBe(1);
    expect(((body as { name: string }[])[0]).name).toBe("B");
  });
});
