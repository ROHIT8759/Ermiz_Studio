/**
 * Unit tests for POST /api/gen
 *
 * Strategy:
 *  - Import the Next.js route handler directly (no HTTP server needed).
 *  - Mock @google/genai so tests are fast, deterministic, and offline.
 *  - Use real JSZip to verify that returned ZIPs actually contain the files.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import JSZip from "jszip";

// ---------------------------------------------------------------------------
// vi.hoisted ensures mockGenerateContent is available inside vi.mock(), which
// is hoisted to the top of the file by Vitest before any imports run.
// The factory must use a regular function (not an arrow) so `new GoogleGenAI()`
// works — arrow functions cannot be constructors.
// ---------------------------------------------------------------------------
const { mockGenerateContent } = vi.hoisted(() => ({
  mockGenerateContent: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.models = { generateContent: mockGenerateContent };
  }),
}));

// Import route AFTER mock registration
const { POST } = await import("@/app/api/gen/route");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_NODES = [
  {
    id: "node-1",
    type: "process",
    position: { x: 100, y: 100 },
    data: {
      kind: "process",
      id: "process_1",
      label: "My Function",
      processType: "function_block",
      execution: "sync",
      inputs: [],
      outputs: { success: [], error: [] },
      steps: [],
    },
  },
];

const VALID_EDGES = [
  { id: "e1", source: "node-1", target: "node-2" },
];

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/gen", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const PLAN_RESPONSE = {
  text: JSON.stringify({
    projectName: "test-project",
    description: "A generated test project",
    files: [
      { path: "src/index.ts", description: "Main entry point" },
      { path: "package.json", description: "NPM manifest" },
    ],
  }),
};

const CODE_RESPONSE = (path: string) => ({
  text: `// Generated code for ${path}\nexport default {};`,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/gen", () => {
  // Save originals for all key formats
  const savedKeys: Record<string, string | undefined> = {};

  function clearAllKeys() {
    delete process.env.GEMINI_API_KEY;
    for (let i = 1; i <= 10; i++) {
      delete process.env[`GEMINI_API_KEY_${i}`];
    }
  }

  beforeEach(() => {
    vi.clearAllMocks();
    // Save current env
    savedKeys["GEMINI_API_KEY"] = process.env.GEMINI_API_KEY;
    for (let i = 1; i <= 10; i++) {
      savedKeys[`GEMINI_API_KEY_${i}`] = process.env[`GEMINI_API_KEY_${i}`];
    }
    // Default: single key via numbered format
    clearAllKeys();
    process.env.GEMINI_API_KEY_1 = "test-api-key";
  });

  afterEach(() => {
    // Restore originals
    clearAllKeys();
    for (const [key, val] of Object.entries(savedKeys)) {
      if (val !== undefined) process.env[key] = val;
    }
  });

  // ── 400 guards ────────────────────────────────────────────────────────────

  it("returns 400 when nodes is missing", async () => {
    const res = await POST(makeRequest({ edges: VALID_EDGES }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Missing nodes or edges");
  });

  it("returns 400 when edges is missing", async () => {
    const res = await POST(makeRequest({ nodes: VALID_NODES }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Missing nodes or edges");
  });

  it("returns 400 when body is empty", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Missing nodes or edges");
  });

  // ── 500 env guard ─────────────────────────────────────────────────────────

  it("returns 500 when no GEMINI_API_KEY is set", async () => {
    clearAllKeys();
    const res = await POST(makeRequest({ nodes: VALID_NODES, edges: VALID_EDGES }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("GEMINI_API_KEY not configured");
  });

  // ── happy path ────────────────────────────────────────────────────────────

  it("returns 200 with a valid ZIP on success", async () => {
    // First call → architecture plan; subsequent calls → file code
    mockGenerateContent
      .mockResolvedValueOnce(PLAN_RESPONSE)
      .mockResolvedValue(CODE_RESPONSE("src/index.ts"));

    const res = await POST(makeRequest({ nodes: VALID_NODES, edges: VALID_EDGES }));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/zip");
    expect(res.headers.get("Content-Disposition")).toContain("generated-project.zip");

    // Verify the ZIP actually contains the expected files
    const arrayBuffer = await res.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const files = Object.keys(zip.files);
    expect(files).toContain("src/index.ts");
    expect(files).toContain("package.json");
  });

  it("includes generated code content inside the ZIP", async () => {
    mockGenerateContent
      .mockResolvedValueOnce(PLAN_RESPONSE)
      .mockResolvedValueOnce(CODE_RESPONSE("src/index.ts"))
      .mockResolvedValueOnce(CODE_RESPONSE("package.json"));

    const res = await POST(makeRequest({ nodes: VALID_NODES, edges: VALID_EDGES }));
    expect(res.status).toBe(200);

    const zip = await JSZip.loadAsync(await res.arrayBuffer());
    const content = await zip.file("src/index.ts")?.async("string");
    expect(content).toContain("Generated code for src/index.ts");
  });

  it("passes techStack and metadata through to the AI", async () => {
    mockGenerateContent
      .mockResolvedValueOnce(PLAN_RESPONSE)
      .mockResolvedValue(CODE_RESPONSE("src/index.ts"));

    await POST(
      makeRequest({
        nodes: VALID_NODES,
        edges: VALID_EDGES,
        techStack: { backend: "node", database: "postgres" },
        metadata: { version: "1" },
      }),
    );

    // The plan call (first) should receive a prompt containing the techStack
    const firstCallArg = mockGenerateContent.mock.calls[0][0];
    expect(firstCallArg.contents).toContain("postgres");
    expect(firstCallArg.contents).toContain("backend");
  });

  // ── language parameter ────────────────────────────────────────────────────

  it("generates Python/FastAPI plan when language is 'python'", async () => {
    mockGenerateContent
      .mockResolvedValueOnce(PLAN_RESPONSE)
      .mockResolvedValue(CODE_RESPONSE("src/main.py"));

    const res = await POST(
      makeRequest({
        nodes: VALID_NODES,
        edges: VALID_EDGES,
        language: "python",
      }),
    );
    expect(res.status).toBe(200);

    // Plan prompt should mention Python / FastAPI
    const planPrompt = mockGenerateContent.mock.calls[0][0].contents;
    expect(planPrompt).toContain("Python");
    expect(planPrompt).toContain("FastAPI");
  });

  it("generates JS/Express plan when language is 'javascript'", async () => {
    mockGenerateContent
      .mockResolvedValueOnce(PLAN_RESPONSE)
      .mockResolvedValue(CODE_RESPONSE("src/index.ts"));

    const res = await POST(
      makeRequest({
        nodes: VALID_NODES,
        edges: VALID_EDGES,
        language: "javascript",
      }),
    );
    expect(res.status).toBe(200);

    const planPrompt = mockGenerateContent.mock.calls[0][0].contents;
    expect(planPrompt).toContain("Express");
    expect(planPrompt).toContain("JavaScript");
  });

  it("defaults to javascript when no language is provided", async () => {
    mockGenerateContent
      .mockResolvedValueOnce(PLAN_RESPONSE)
      .mockResolvedValue(CODE_RESPONSE("src/index.ts"));

    await POST(makeRequest({ nodes: VALID_NODES, edges: VALID_EDGES }));

    const planPrompt = mockGenerateContent.mock.calls[0][0].contents;
    expect(planPrompt).toContain("Express");
  });

  it("uses Python-specific rules in code gen prompt", async () => {
    mockGenerateContent
      .mockResolvedValueOnce(PLAN_RESPONSE)
      .mockResolvedValue(CODE_RESPONSE("src/main.py"));

    await POST(
      makeRequest({
        nodes: VALID_NODES,
        edges: VALID_EDGES,
        language: "python",
      }),
    );

    // Second call onward is code gen — check it has Python rules
    const codePrompt = mockGenerateContent.mock.calls[1][0].contents;
    expect(codePrompt).toContain("Python");
    expect(codePrompt).toContain("PEP 8");
  });

  it("caps file generation at 20 files", async () => {
    const manyFiles = Array.from({ length: 30 }, (_, i) => ({
      path: `src/file${i}.ts`,
      description: `File ${i}`,
    }));
    const bigPlan = { text: JSON.stringify({ projectName: "big", description: "big", files: manyFiles }) };

    mockGenerateContent
      .mockResolvedValueOnce(bigPlan)
      .mockResolvedValue({ text: "// code" });

    const res = await POST(makeRequest({ nodes: VALID_NODES, edges: VALID_EDGES }));
    expect(res.status).toBe(200);

    // genCodeAi should be called at most 20 times (plan call + 20 code calls)
    expect(mockGenerateContent).toHaveBeenCalledTimes(21);
  });

  // ── AI failure paths ──────────────────────────────────────────────────────

  it("returns 500 when the AI plan call throws a non-quota error", async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error("network connection refused"));

    const res = await POST(makeRequest({ nodes: VALID_NODES, edges: VALID_EDGES }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal server error");
  });

  it("returns 429 when Gemini returns RESOURCE_EXHAUSTED on plan call", async () => {
    mockGenerateContent.mockRejectedValueOnce(
      new Error('RESOURCE_EXHAUSTED: Please retry in 54s'),
    );

    const res = await POST(makeRequest({ nodes: VALID_NODES, edges: VALID_EDGES }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain("quota exceeded");
    expect(body.retryAfter).toBeGreaterThan(0);
  });

  it("returns 500 when AI returns malformed plan JSON", async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: "not json at all" });

    const res = await POST(makeRequest({ nodes: VALID_NODES, edges: VALID_EDGES }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal server error");
  });

  it("returns 500 when AI returns plan with no files array", async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ projectName: "x", description: "y" }),
    });

    const res = await POST(makeRequest({ nodes: VALID_NODES, edges: VALID_EDGES }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal server error");
  });

  it("returns 500 when genCodeAi rejects with a non-quota error", async () => {
    mockGenerateContent
      .mockResolvedValueOnce(PLAN_RESPONSE)
      .mockRejectedValueOnce(new Error("unexpected server error"));

    const res = await POST(makeRequest({ nodes: VALID_NODES, edges: VALID_EDGES }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal server error");
  });

  it("strips markdown fences from AI plan response before parsing", async () => {
    const fencedPlan = {
      text: "```json\n" + JSON.stringify({
        projectName: "fenced-project",
        description: "A project with fenced JSON",
        files: [{ path: "index.js", description: "Entry" }],
      }) + "\n```",
    };

    mockGenerateContent
      .mockResolvedValueOnce(fencedPlan)
      .mockResolvedValue({ text: "// code" });

    const res = await POST(makeRequest({ nodes: VALID_NODES, edges: VALID_EDGES }));
    expect(res.status).toBe(200);

    const zip = await JSZip.loadAsync(await res.arrayBuffer());
    expect(Object.keys(zip.files)).toContain("index.js");
  });

  it("uses the correct AI model (gemini-2.5-flash)", async () => {
    mockGenerateContent
      .mockResolvedValueOnce(PLAN_RESPONSE)
      .mockResolvedValue({ text: "// code" });

    await POST(makeRequest({ nodes: VALID_NODES, edges: VALID_EDGES }));

    for (const call of mockGenerateContent.mock.calls) {
      expect(call[0].model).toBe("gemini-2.5-flash");
    }
  });

  // ── multi-key rotation ──────────────────────────────────────────────────

  it("rotates to a second API key when the first is quota-exhausted", async () => {
    clearAllKeys();
    process.env.GEMINI_API_KEY_1 = "key-a";
    process.env.GEMINI_API_KEY_2 = "key-b";

    // First call (plan with key-a) → quota error
    // Second call (plan with key-b) → success
    // Third+ calls (code gen with key-b) → success
    mockGenerateContent
      .mockRejectedValueOnce(new Error("RESOURCE_EXHAUSTED: retry in 30s"))
      .mockResolvedValueOnce(PLAN_RESPONSE)
      .mockResolvedValue(CODE_RESPONSE("src/index.ts"));

    const res = await POST(makeRequest({ nodes: VALID_NODES, edges: VALID_EDGES }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/zip");

    // Verify it tried twice for the plan + code calls
    expect(mockGenerateContent.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("returns 429 only when ALL keys are exhausted", async () => {
    clearAllKeys();
    process.env.GEMINI_API_KEY_1 = "key-a";
    process.env.GEMINI_API_KEY_2 = "key-b";
    process.env.GEMINI_API_KEY_3 = "key-c";

    // All three keys return quota errors for the plan call
    mockGenerateContent
      .mockRejectedValueOnce(new Error("RESOURCE_EXHAUSTED: retry in 10s"))
      .mockRejectedValueOnce(new Error("RESOURCE_EXHAUSTED: retry in 20s"))
      .mockRejectedValueOnce(new Error("RESOURCE_EXHAUSTED: retry in 30s"));

    const res = await POST(makeRequest({ nodes: VALID_NODES, edges: VALID_EDGES }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain("quota");
  });

  it("reports remaining key count in X-Gemini-Keys header", async () => {
    clearAllKeys();
    process.env.GEMINI_API_KEY_1 = "key-a";
    process.env.GEMINI_API_KEY_2 = "key-b";

    mockGenerateContent
      .mockResolvedValueOnce(PLAN_RESPONSE)
      .mockResolvedValue({ text: "// code" });

    const res = await POST(makeRequest({ nodes: VALID_NODES, edges: VALID_EDGES }));
    expect(res.status).toBe(200);
    // Both keys healthy → "2/2"
    expect(res.headers.get("X-Gemini-Keys")).toBe("2/2");
  });
});
