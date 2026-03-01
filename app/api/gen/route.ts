import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { Edge } from "@xyflow/react";
import { GoogleGenAI } from "@google/genai";
import Groq from "groq-sdk";

export const runtime = "nodejs";

/**
 * Which Gemini model to use. Override with GEMINI_MODEL env var.
 * gemini-2.5-flash-lite — fastest, lowest token cost, good free-tier quota.
 */
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash-lite";

/**
 * Which Groq model to use as fallback when all Gemini keys are exhausted.
 * llama-3.3-70b-versatile — best general/code model on Groq's free tier.
 */
const GROQ_MODEL = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";

// ─────────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────────

class QuotaExceededError extends Error {
  retryAfter: number;
  constructor(retryAfter = 60) {
    super("Gemini API free-tier quota exceeded");
    this.name = "QuotaExceededError";
    this.retryAfter = retryAfter;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Key helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Collect Gemini API keys from environment variables.
 *   1) Numbered:         GEMINI_API_KEY_1 … GEMINI_API_KEY_N  (priority)
 *   2) Comma-separated:  GEMINI_API_KEY="key1,key2,key3"
 */
function getApiKeys(): string[] {
  const numbered: string[] = [];
  for (let i = 1; ; i++) {
    const val = process.env[`GEMINI_API_KEY_${i}`]?.trim();
    if (!val) break;
    numbered.push(val);
  }
  if (numbered.length > 0) return numbered;

  const raw = process.env.GEMINI_API_KEY ?? "";
  return raw.split(",").map((k) => k.trim()).filter(Boolean);
}

/**
 * Extract a retry-after delay (seconds) from a Gemini API quota/rate error.
 * Returns null if the error is NOT a quota/rate-limit error.
 */
function getQuotaRetryAfter(error: unknown): number | null {
  const msg = error instanceof Error ? error.message : String(error);

  const hasQuotaMarker =
    msg.includes("RESOURCE_EXHAUSTED") ||
    msg.includes('"code":429') ||
    msg.toLowerCase().includes("quota exceeded") ||
    msg.toLowerCase().includes("rate limit") ||
    msg.toLowerCase().includes("too many requests");

  if (hasQuotaMarker) {
    const m =
      msg.match(/retryDelay["\s:]+?(\d+)s/i) ||
      msg.match(/retry.?after["\s:]+?(\d+)/i) ||
      msg.match(/retry in ([\d.]+)s/i);
    return m ? Math.ceil(Number(m[1])) : 60;
  }

  // Structured error object (Google SDK wraps some errors this way)
  if (error && typeof error === "object" && "error" in error) {
    const e = (error as { error?: { code?: number; status?: string; details?: Array<{ retryDelay?: string }> } }).error;
    if (e?.code === 429 || e?.status === "RESOURCE_EXHAUSTED") {
      const delay = e.details?.find((d) => d?.retryDelay)?.retryDelay;
      const m = delay?.match(/^(\d+)(?:\.\d+)?s$/);
      return m ? Math.ceil(Number(m[1])) : 60;
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// KeyRotator — shared across all concurrent workers within one request
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Timestamp-based key rotator. Instead of permanently marking a key as
 * "exhausted", it records *when* each key can be used again. The rotator
 * uses a global round-robin counter so concurrent workers naturally spread
 * across all keys without colliding.
 *
 * When every key is temporarily cooling down, `acquire()` sleeps until
 * the soonest one recovers — then returns it. This means a generation
 * request keeps going even after a burst of 429s rather than giving up.
 */
class KeyRotator {
  /** Unix-ms timestamp after which key[i] is available again (0 = immediately). */
  private readonly cooldowns: number[];
  /** Global counter for round-robin selection across concurrent callers. */
  private counter = 0;

  constructor(private readonly keys: string[]) {
    this.cooldowns = new Array(keys.length).fill(0);
  }

  get length() { return this.keys.length; }

  get availableCount() {
    const now = Date.now();
    return this.cooldowns.filter((t) => t <= now).length;
  }

  /**
   * Return the next available key.
   * If all keys are cooling down, sleeps until the soonest one recovers.
   * Throws QuotaExceededError if the total wait would exceed `maxWaitMs`.
   */
  async acquire(maxWaitMs = 120_000): Promise<{ key: string; index: number }> {
    const deadline = Date.now() + maxWaitMs;

    while (true) {
      const now = Date.now();
      if (now > deadline) throw new QuotaExceededError(Math.ceil((now - (deadline - maxWaitMs)) / 1000));

      // Round-robin: try every key starting from the current counter position
      for (let attempt = 0; attempt < this.keys.length; attempt++) {
        const i = this.counter % this.keys.length;
        this.counter++;
        if (this.cooldowns[i] <= Date.now()) {
          return { key: this.keys[i], index: i };
        }
      }

      // All keys in cooldown — wait for the earliest one to recover
      const soonestCooldown = Math.min(...this.cooldowns);
      const waitMs = Math.max(300, soonestCooldown - Date.now() + 150);
      const remaining = deadline - Date.now();
      if (waitMs > remaining) {
        throw new QuotaExceededError(Math.ceil(waitMs / 1000));
      }
      console.warn(`[gen] All ${this.keys.length} keys cooling. Waiting ${waitMs}ms for Key #${this.cooldowns.indexOf(soonestCooldown) + 1}...`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }

  /** Record a cooldown for a key that returned a quota error. */
  setCooldown(index: number, retryAfterSec: number) {
    // Don't shorten an existing longer cooldown
    const until = Date.now() + retryAfterSec * 1000;
    if (until > this.cooldowns[index]) {
      this.cooldowns[index] = until;
    }
    console.warn(`[gen] Key #${index + 1} cooling for ${retryAfterSec}s`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared Gemini call helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Call Gemini with automatic key rotation and cooldown-aware retry.
 * Uses the KeyRotator to pick the next available key; if a quota error
 * occurs, marks that key as cooling and immediately tries the next one
 * (waiting if all are temporarily rate-limited).
 */
async function callGemini(
  rotator: KeyRotator,
  prompt: string,
  onRequest?: () => void,
): Promise<string> {
  // Allow each key to be tried at most twice before giving up
  const maxAttempts = rotator.length * 2;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { key, index } = await rotator.acquire();

    try {
      const ai = new GoogleGenAI({ apiKey: key });
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
      });
      onRequest?.();
      return response.text?.trim() ?? "";
    } catch (error) {
      const retryAfter = getQuotaRetryAfter(error);
      if (retryAfter !== null) {
        rotator.setCooldown(index, retryAfter);
        continue; // rotator will pick the next available key
      }
      // Non-quota error: propagate immediately (no key rotation helps here)
      throw error;
    }
  }

  throw new QuotaExceededError(60);
}

// ─────────────────────────────────────────────────────────────────────────────
// Groq fallback
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Call Groq (llama-3.3-70b-versatile by default) as a fallback when every
 * Gemini key is cooling down. Groq's free tier has generous RPM limits and
 * fast inference — ideal as a safety net for quota bursts.
 */
async function callGroq(prompt: string, onRequest?: () => void): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) throw new Error("GROQ_API_KEY not configured");

  const groq = new Groq({ apiKey });
  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
    max_tokens: 8192,
  });

  onRequest?.();
  return completion.choices[0]?.message?.content?.trim() ?? "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified AI caller — Gemini first, Groq as fallback
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true for transient network/connectivity errors (timeout, DNS,
 * connection reset) that warrant an immediate Groq fallback instead of
 * propagating the error — since all Gemini keys share the same endpoint,
 * retrying a different key won't help when the network itself is the issue.
 */
function isNetworkError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const cause = (error as { cause?: { code?: string } })?.cause;
  return (
    msg.toLowerCase().includes("fetch failed") ||
    msg.toLowerCase().includes("connect timeout") ||
    msg.toLowerCase().includes("network") ||
    cause?.code === "UND_ERR_CONNECT_TIMEOUT" ||
    cause?.code === "ECONNRESET" ||
    cause?.code === "ENOTFOUND"
  );
}

/**
 * Try Gemini (all keys, with rotation + cooldown-aware retry).
 * Falls back to Groq when:
 *   • QuotaExceededError — all Gemini keys exhausted / cooling
 *   • Network/timeout error — Gemini endpoint unreachable (retrying another
 *     key won't help; Groq uses a different endpoint)
 *
 * `usedProvider` is updated to reflect which provider actually answered.
 */
async function callAI(
  rotator: KeyRotator,
  prompt: string,
  usedProvider: { value: "gemini" | "groq" },
  onRequest?: () => void,
): Promise<string> {
  try {
    const text = await callGemini(rotator, prompt, onRequest);
    usedProvider.value = "gemini";
    return text;
  } catch (error) {
    if (error instanceof QuotaExceededError || isNetworkError(error)) {
      const reason = error instanceof QuotaExceededError ? "quota exhausted" : "network error";
      console.warn(`[gen] Gemini unavailable (${reason}) — falling back to Groq...`);
      const text = await callGroq(prompt, onRequest);
      usedProvider.value = "groq";
      return text;
    }
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Concurrency helper
// ─────────────────────────────────────────────────────────────────────────────

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Route types
// ─────────────────────────────────────────────────────────────────────────────

type GenLanguage = "javascript" | "python";

interface GenRequestBody {
  nodes: Node[];
  edges: Edge[];
  language?: GenLanguage;
  techStack?: { frontend?: string; backend?: string; database?: string; deployment?: string };
  metadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/gen
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body: GenRequestBody = await req.json();

    if (!body?.nodes || !body?.edges) {
      return NextResponse.json({ error: "Missing nodes or edges" }, { status: 400 });
    }

    const apiKeys = getApiKeys();
    if (apiKeys.length === 0) {
      return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
    }

    // One rotator shared across planning + all concurrent code-gen workers.
    // This ensures true round-robin and cooldown-aware retry across ALL calls.
    const rotator = new KeyRotator(apiKeys);
    const language: GenLanguage = body.language === "python" ? "python" : "javascript";
    let aiCallCount = 0;
    const usedProvider: { value: "gemini" | "groq" } = { value: "gemini" };
    const onRequest = () => { aiCallCount++; };

    // 1) Plan architecture
    const architecturePlan = await planArchitectureAi({
      nodes: body.nodes,
      edges: body.edges,
      techStack: body.techStack,
      metadata: body.metadata,
      language,
      rotator,
      usedProvider,
      onRequest,
    });

    if (!architecturePlan?.files || !Array.isArray(architecturePlan.files)) {
      return NextResponse.json({ error: "Invalid architecture plan returned by AI" }, { status: 500 });
    }

    // 2) Generate code files — one worker per key, all sharing the same rotator
    const filesToGenerate = architecturePlan.files.slice(0, 20);
    const concurrency = Math.max(1, apiKeys.length); // 5 keys → 5 parallel workers

    const generatedEntries = await mapWithConcurrency(
      filesToGenerate,
      concurrency,
      async (file) => {
        const code = await genCodeAi({
          filePath: file.path,
          description: file.description,
          fullPlan: architecturePlan,
          language,
          rotator,
          usedProvider,
          onRequest,
        });
        return [file.path, code] as const;
      },
    );
    const generatedFiles = Object.fromEntries(generatedEntries);

    // 3) Zip
    const zip = new JSZip();
    Object.entries(generatedFiles).forEach(([p, content]) => zip.file(p, content));
    const zipArrayBuffer = await zip.generateAsync({ type: "arraybuffer" });

    // 4) Forward zip to local deploy server (non-fatal)
    let deployStatus = "skipped";
    const deployUrl = process.env.DEPLOY_URL;
    if (deployUrl) {
      try {
        const deployRes = await fetch(deployUrl, {
          method: "POST",
          headers: { "Content-Type": "application/zip" },
          body: zipArrayBuffer,
          signal: AbortSignal.timeout(15_000), // 15 s timeout
        });
        deployStatus = deployRes.ok ? "ok" : `error:${deployRes.status}`;
        console.log(`[gen] Deploy → ${deployUrl} — ${deployStatus}`);
      } catch (err) {
        deployStatus = "unreachable";
        console.warn("[gen] Deploy server not reachable:", (err as Error).message);
      }
    }

    const providerModel =
      usedProvider.value === "groq" ? GROQ_MODEL : GEMINI_MODEL;

    return new NextResponse(zipArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="generated-project.zip"',
        "X-AI-Requests": String(aiCallCount),
        "X-AI-Provider": usedProvider.value,
        "X-AI-Model": providerModel,
        "X-Generated-Files": String(filesToGenerate.length),
        "X-Gemini-Keys": `${rotator.availableCount}/${apiKeys.length}`,
        "X-Deploy-Status": deployStatus,
      },
    });
  } catch (error: unknown) {
    const retryAfter =
      error instanceof QuotaExceededError
        ? Math.max(1, Math.floor(error.retryAfter))
        : getQuotaRetryAfter(error);

    if (retryAfter !== null) {
      return NextResponse.json(
        {
          error: "AI quota exceeded",
          message: "Gemini quota exhausted or rate-limited. Please wait and retry, or upgrade your plan.",
          retryAfter,
        },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }

    console.error("GEN ERROR:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// planArchitectureAi
// ─────────────────────────────────────────────────────────────────────────────

async function planArchitectureAi(input: {
  nodes: unknown[];
  edges: unknown[];
  techStack?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  language: GenLanguage;
  rotator: KeyRotator;
  usedProvider: { value: "gemini" | "groq" };
  onRequest?: () => void;
}): Promise<{ projectName: string; description: string; files: { path: string; description: string }[] }> {
  const langSpec =
    input.language === "python"
      ? `Python 3.12+, FastAPI, pip
- Entry point: main.py at the project root (run with: python main.py)
- Dependencies: requirements.txt only — NO poetry, NO pyproject.toml
- Include: main.py, requirements.txt, .env.example, Dockerfile, README.md`
      : `JavaScript/TypeScript, Express (Node.js), npm
- Entry point: src/index.ts
- package.json scripts MUST be: { "dev": "tsx src/index.ts", "start": "node dist/index.js", "build": "tsc" }
- devDependencies MUST include: tsx, typescript, @types/node, @types/express (and other @types needed)
- Run with: npm install && npm run dev — this MUST work without any compilation step
- Include: src/index.ts, package.json, tsconfig.json, .env.example, Dockerfile, README.md`;

  const prompt = `You are a senior software architect.
Generate a COMPLETE production-ready backend project file structure for the given architecture.

Language stack:
${langSpec}

Rules:
- Plan exact folders and files.
- Every file needs a detailed description of its responsibility.
- Do NOT generate code. Output ONLY the JSON plan.
- PYTHON ONLY: entry point MUST be main.py at root; never include pyproject.toml or poetry.
- JS/TS ONLY: package.json MUST have scripts { "dev": "tsx src/index.ts", "start": "node dist/index.js", "build": "tsc" } and devDependencies with "tsx" so npm run dev works immediately after npm install.

Return STRICT JSON only:
{"projectName":"string","description":"string","files":[{"path":"relative/path.ext","description":"detailed responsibility"}]}

No markdown. No explanation outside JSON.

Architecture:
${JSON.stringify({ nodes: input.nodes, edges: input.edges, techStack: input.techStack, metadata: input.metadata })}`;

  try {
    const text = await callAI(input.rotator, prompt, input.usedProvider, input.onRequest);
    if (!text) throw new Error("Empty response from AI");

    const clean = text.replace(/```[\w]*\n?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(clean);

    if (!parsed.files || !Array.isArray(parsed.files)) {
      throw new Error("Invalid file structure returned by AI");
    }

    return {
      projectName: parsed.projectName || "generated-project",
      description: parsed.description || "",
      files: parsed.files,
    };
  } catch (error) {
    if (error instanceof QuotaExceededError) throw error;
    console.error("PLAN ARCHITECTURE ERROR:", error);
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Architecture planning failed: ${msg}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// genCodeAi
// ─────────────────────────────────────────────────────────────────────────────

// Files that need no AI call — always legitimately empty or should be skipped
const EMPTY_FILE_RE = [/\.gitkeep$/, /\.gitignore$/, /__init__\.py$/, /pyproject\.toml$/];

async function genCodeAi(input: {
  filePath: string;
  description: string;
  fullPlan: { projectName: string; description: string; files: { path: string; description: string }[] };
  language: GenLanguage;
  rotator: KeyRotator;
  usedProvider: { value: "gemini" | "groq" };
  onRequest?: () => void;
}): Promise<string> {
  if (EMPTY_FILE_RE.some((re) => re.test(input.filePath))) return "";

  const langRules =
    input.language === "python"
      ? `Python 3.12+, type hints, PEP 8, async/await FastAPI, real package versions in requirements.txt.
- Entry point is main.py at project root; app starts with: python main.py
- Use pip + requirements.txt — never use poetry or pyproject.toml.
- If generating main.py: include uvicorn.run(..., host="0.0.0.0", port=8000) so it starts directly.`
      : `JavaScript/TypeScript, Express (Node.js), strict TS types, process.env for config.
- If generating package.json:
  * scripts MUST be: { "dev": "tsx src/index.ts", "start": "node dist/index.js", "build": "tsc" }
  * devDependencies MUST include: "tsx", "typescript", "@types/node", "@types/express" (plus any other @types for packages used)
  * All real package versions — no placeholders like "^x.x.x"
- App MUST start by running: npm install && npm run dev — zero extra steps.
- Never use ts-node, nodemon, or require("ts-node/register").`;

  // Abbreviated file list — just paths — to reduce token usage per call
  const filePaths = input.fullPlan.files.map((f) => f.path).join("\n");

  const prompt = `You are a senior software engineer.
Generate the FULL production-ready code for ONE file.

Project: ${input.fullPlan.projectName}
Description: ${input.fullPlan.description}
Language rules: ${langRules}

All files in the project:
${filePaths}

File to generate:
Path: ${input.filePath}
Responsibility: ${input.description}

Rules: Output ONLY raw code. No markdown. No explanations. No placeholder text. No pseudo-code.
Generate complete code now.`;

  try {
    const text = await callAI(input.rotator, prompt, input.usedProvider, input.onRequest);
    if (!text) return "";
    // Strip accidental markdown fences
    return text.replace(/```[\w]*\n?/g, "").replace(/```/g, "").trim();
  } catch (error) {
    if (error instanceof QuotaExceededError) throw error;
    console.error(`CODE GENERATION ERROR (${input.filePath}):`, error);
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Code generation failed for ${input.filePath}: ${msg}`);
  }
}
