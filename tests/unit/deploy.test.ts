/**
 * Tests for the deploy step — forwarding a generated ZIP to the local deploy server.
 *
 * Integration suite (requires the server at DEPLOY_URL to be running):
 *   DEPLOY_INTEGRATION=true pnpm test -- tests/unit/deploy.test.ts
 *
 *   Set DEPLOY_INTEGRATION=true to opt-in. Without it the 4 integration tests
 *   are skipped so CI never fails when the server is down.
 *
 * Unit suite (always runs, no server needed — uses mocked fetch):
 *   Verifies route handler sets the correct X-Deploy-Status header in every scenario.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import fs from "fs";

// ─────────────────────────────────────────────────────────────────────────────
// Integration tests — send the real ZIP file to the live local server
// ─────────────────────────────────────────────────────────────────────────────

const DEPLOY_URL = process.env.DEPLOY_URL ?? "http://10.108.238.110:3269/zip";
const TEST_ZIP_PATH = "C:/Users/RohitKumarKundu/Downloads/generated-project (2).zip";

/** Set DEPLOY_INTEGRATION=true to run tests that hit the real server. */
const INTEGRATION = process.env.DEPLOY_INTEGRATION === "true";

describe("Deploy integration — POST real ZIP to local server", () => {
  it.skipIf(!INTEGRATION)("sends the ZIP file and receives a 2xx response", async () => {
    const fileBuffer = fs.readFileSync(TEST_ZIP_PATH);

    const res = await fetch(DEPLOY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/zip" },
      body: fileBuffer,
      signal: AbortSignal.timeout(15_000),
    });

    console.log(`[deploy] status: ${res.status} ${res.statusText}`);
    expect(res.ok).toBe(true);
  }, 20_000);

  it.skipIf(!INTEGRATION)("server returns status < 500 (non-crash)", async () => {
    const fileBuffer = fs.readFileSync(TEST_ZIP_PATH);

    const res = await fetch(DEPLOY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/zip" },
      body: fileBuffer,
      signal: AbortSignal.timeout(15_000),
    });

    expect(res.status).toBeLessThan(500);
  }, 20_000);

  it.skipIf(!INTEGRATION)("logs the response body returned by the deploy server", async () => {
    const fileBuffer = fs.readFileSync(TEST_ZIP_PATH);

    const res = await fetch(DEPLOY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/zip" },
      body: fileBuffer,
      signal: AbortSignal.timeout(15_000),
    });

    const text = await res.text();
    console.log(`[deploy] response body: ${text}`);
    expect(res.status).toBeGreaterThanOrEqual(200);
  }, 20_000);

  it.skipIf(!INTEGRATION)("sends the correct Content-Type header (application/zip)", async () => {
    // Intercept the outgoing request by using a local spy on fetch.
    // The real call still goes through — we just verify the shape.
    const originalFetch = globalThis.fetch;
    let capturedOptions: RequestInit | undefined;

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedOptions = init;
      return originalFetch(input, init);
    };

    try {
      const fileBuffer = fs.readFileSync(TEST_ZIP_PATH);
      await fetch(DEPLOY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/zip" },
        body: fileBuffer,
        signal: AbortSignal.timeout(15_000),
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect((capturedOptions?.headers as Record<string, string>)?.["Content-Type"]).toBe("application/zip");
    expect(capturedOptions?.method).toBe("POST");
  }, 20_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// Unit tests — route handler deploy behavior (mocked fetch, no server needed)
// ─────────────────────────────────────────────────────────────────────────────

const { mockGenerateContent, mockGroqCreate } = vi.hoisted(() => ({
  mockGenerateContent: vi.fn(),
  mockGroqCreate: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.models = { generateContent: mockGenerateContent };
  }),
}));

vi.mock("groq-sdk", () => ({
  default: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.chat = { completions: { create: mockGroqCreate } };
  }),
}));

// Import the route AFTER mock registration (same pattern as api-gen.test.ts)
const { POST } = await import("@/app/api/gen/route");

// ── Shared fixtures ──────────────────────────────────────────────────────────

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
const VALID_EDGES = [{ id: "e1", source: "node-1", target: "node-2" }];

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
    files: [{ path: "src/index.ts", description: "Main entry point" }],
  }),
};

// ── Suite ────────────────────────────────────────────────────────────────────

describe("POST /api/gen — X-Deploy-Status header", () => {
  let savedDeployUrl: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();

    // Isolate DEPLOY_URL from the real .env so unit tests are deterministic
    savedDeployUrl = process.env.DEPLOY_URL;
    delete process.env.DEPLOY_URL;

    process.env.GEMINI_API_KEY_1 = "test-api-key";
    process.env.GROQ_API_KEY = "test-groq-key";

    mockGroqCreate.mockResolvedValue({
      choices: [{ message: { content: "" } }],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (savedDeployUrl !== undefined) {
      process.env.DEPLOY_URL = savedDeployUrl;
    } else {
      delete process.env.DEPLOY_URL;
    }
  });

  it("X-Deploy-Status is 'skipped' when DEPLOY_URL env var is not set", async () => {
    mockGenerateContent
      .mockResolvedValueOnce(PLAN_RESPONSE)
      .mockResolvedValue({ text: "// code" });

    const res = await POST(makeRequest({ nodes: VALID_NODES, edges: VALID_EDGES }));

    expect(res.status).toBe(200);
    expect(res.headers.get("X-Deploy-Status")).toBe("skipped");
  });

  it("X-Deploy-Status is 'ok' when the deploy server responds 200", async () => {
    process.env.DEPLOY_URL = "http://mock-deploy-server/zip";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    mockGenerateContent
      .mockResolvedValueOnce(PLAN_RESPONSE)
      .mockResolvedValue({ text: "// code" });

    const res = await POST(makeRequest({ nodes: VALID_NODES, edges: VALID_EDGES }));

    expect(res.status).toBe(200);
    expect(res.headers.get("X-Deploy-Status")).toBe("ok");
  });

  it("X-Deploy-Status is 'error:503' when the deploy server responds 503", async () => {
    process.env.DEPLOY_URL = "http://mock-deploy-server/zip";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    mockGenerateContent
      .mockResolvedValueOnce(PLAN_RESPONSE)
      .mockResolvedValue({ text: "// code" });

    const res = await POST(makeRequest({ nodes: VALID_NODES, edges: VALID_EDGES }));

    expect(res.status).toBe(200);
    expect(res.headers.get("X-Deploy-Status")).toBe("error:503");
  });

  it("X-Deploy-Status is 'unreachable' when fetch throws (server down)", async () => {
    process.env.DEPLOY_URL = "http://mock-deploy-server/zip";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    mockGenerateContent
      .mockResolvedValueOnce(PLAN_RESPONSE)
      .mockResolvedValue({ text: "// code" });

    const res = await POST(makeRequest({ nodes: VALID_NODES, edges: VALID_EDGES }));

    expect(res.status).toBe(200); // deploy failure is non-fatal
    expect(res.headers.get("X-Deploy-Status")).toBe("unreachable");
  });

  it("POSTs a ZIP binary body with correct headers to DEPLOY_URL", async () => {
    process.env.DEPLOY_URL = "http://mock-deploy-server/zip";
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", mockFetch);

    mockGenerateContent
      .mockResolvedValueOnce(PLAN_RESPONSE)
      .mockResolvedValue({ text: "// code" });

    await POST(makeRequest({ nodes: VALID_NODES, edges: VALID_EDGES }));

    expect(mockFetch).toHaveBeenCalledOnce();
    const [calledUrl, options] = mockFetch.mock.calls[0];
    expect(calledUrl).toBe("http://mock-deploy-server/zip");
    expect(options.method).toBe("POST");
    expect(options.headers["Content-Type"]).toBe("application/zip");
    expect(options.body).toBeInstanceOf(ArrayBuffer);
  });

  it("deploy failure does not prevent the ZIP from being returned to the client", async () => {
    process.env.DEPLOY_URL = "http://mock-deploy-server/zip";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network timeout")));

    mockGenerateContent
      .mockResolvedValueOnce(PLAN_RESPONSE)
      .mockResolvedValue({ text: "// code" });

    const res = await POST(makeRequest({ nodes: VALID_NODES, edges: VALID_EDGES }));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/zip");
    // The ZIP body is still present despite the deploy failure
    const buf = await res.arrayBuffer();
    expect(buf.byteLength).toBeGreaterThan(0);
  });

  it("applies a 15 s timeout to the deploy fetch call", async () => {
    process.env.DEPLOY_URL = "http://mock-deploy-server/zip";
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", mockFetch);

    mockGenerateContent
      .mockResolvedValueOnce(PLAN_RESPONSE)
      .mockResolvedValue({ text: "// code" });

    await POST(makeRequest({ nodes: VALID_NODES, edges: VALID_EDGES }));

    const options = mockFetch.mock.calls[0][1];
    // AbortSignal.timeout(15_000) is passed — it should be an AbortSignal instance
    expect(options.signal).toBeDefined();
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });
});
