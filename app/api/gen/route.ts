import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { Edge } from "@xyflow/react";
import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";

/** Thrown when the Gemini API returns RESOURCE_EXHAUSTED (free-tier quota). */
class QuotaExceededError extends Error {
  retryAfter: number;
  constructor(retryAfter = 60) {
    super("Gemini API free-tier quota exceeded");
    this.name = "QuotaExceededError";
    this.retryAfter = retryAfter;
  }
}

/**
 * Collect Gemini API keys from environment variables.
 * Supports two formats:
 *   1) Numbered keys: GEMINI_API_KEY_1, GEMINI_API_KEY_2, … GEMINI_API_KEY_N
 *   2) Comma-separated: GEMINI_API_KEY="key1,key2,key3"
 * Numbered keys take priority when present.
 */
function getApiKeys(): string[] {
  // 1) Collect numbered keys (GEMINI_API_KEY_1 … GEMINI_API_KEY_N)
  const numbered: string[] = [];
  for (let i = 1; ; i++) {
    const val = process.env[`GEMINI_API_KEY_${i}`]?.trim();
    if (!val) break;
    numbered.push(val);
  }
  if (numbered.length > 0) return numbered;

  // 2) Fall back to comma-separated GEMINI_API_KEY
  const raw = process.env.GEMINI_API_KEY || "";
  return raw.split(",").map((k) => k.trim()).filter(Boolean);
}

function getQuotaRetryAfter(error: unknown): number | null {
  const msg = error instanceof Error ? error.message : String(error);
  const hasQuotaMarker =
    msg.includes("RESOURCE_EXHAUSTED") ||
    msg.includes("\"code\":429") ||
    msg.toLowerCase().includes("quota exceeded") ||
    msg.toLowerCase().includes("rate limit");

  if (hasQuotaMarker) {
    const retryMatch =
      msg.match(/retryDelay["\s:]+?(\d+)s/i) ||
      msg.match(/retry in ([\d.]+)s/i);
    return retryMatch ? Math.ceil(Number(retryMatch[1])) : 60;
  }

  if (error && typeof error === "object" && "error" in error) {
    const anyError = error as {
      error?: {
        code?: number;
        status?: string;
        message?: string;
        details?: Array<{
          "@type"?: string;
          retryDelay?: string;
        }>;
      };
    };
    const code = anyError.error?.code;
    const status = anyError.error?.status;
    if (code === 429 || status === "RESOURCE_EXHAUSTED") {
      const retryDelay = anyError.error?.details?.find(
        (detail) => detail?.retryDelay,
      )?.retryDelay;
      const retryMatch = retryDelay?.match(/^(\d+)(?:\.\d+)?s$/);
      return retryMatch ? Math.ceil(Number(retryMatch[1])) : 60;
    }
  }

  return null;
}

/**
 * Runs `fn` over `items` with at most `limit` concurrent tasks.
 * Each worker picks the next available item so fast tasks don't block slow ones.
 */
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

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

interface GenRequestBody {
  nodes: Node[];
  edges: Edge[];
  techStack?: {
    frontend?: string;
    backend?: string;
    database?: string;
    deployment?: string;
  };
  metadata?: Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  try {
    const body: GenRequestBody = await req.json();

    if (!body?.nodes || !body?.edges) {
      return NextResponse.json(
        { error: "Missing nodes or edges" },
        { status: 400 },
      );
    }

    const apiKeys = getApiKeys();
    if (apiKeys.length === 0) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY not configured" },
        { status: 500 },
      );
    }

    // Track which keys are quota-exhausted during this request so
    // parallel genCodeAi calls skip already-dead keys immediately.
    const exhaustedKeys = new Set<number>();

    // 1) Plan architecture
    let geminiCallCount = 0;
    const architecturePlan = await planArchitectureAi({
      nodes: body.nodes,
      edges: body.edges,
      techStack: body.techStack,
      metadata: body.metadata,
      apiKeys,
      exhaustedKeys,
      onRequest: () => { geminiCallCount++; },
    });

    if (!architecturePlan?.files || !Array.isArray(architecturePlan.files)) {
      return NextResponse.json(
        { error: "Invalid architecture plan returned by AI" },
        { status: 500 },
      );
    }

    // 2) Generate code files with bounded concurrency (one worker per API key).
    //    Round-robin key assignment ensures simultaneous requests each use a
    //    different key — no pile-up on key #0 like Promise.all would cause.
    const filesToGenerate = architecturePlan.files.slice(0, 20);
    const concurrency = Math.max(1, apiKeys.length); // e.g. 5 keys → 5 workers
    const generatedEntries = await mapWithConcurrency(
      filesToGenerate,
      concurrency,
      async (file, idx) => {
        const code = await genCodeAi({
          filePath: file.path,
          description: file.description,
          fullPlan: architecturePlan,
          apiKeys,
          exhaustedKeys,
          startKeyIndex: idx % apiKeys.length, // round-robin starting key
          onRequest: () => { geminiCallCount++; },
        });
        return [file.path, code] as const;
      },
    );
    const generatedFiles = Object.fromEntries(generatedEntries);

    // 3) Zip all files
    const zip = new JSZip();
    Object.entries(generatedFiles).forEach(([filePath, content]) => {
      zip.file(filePath, content);
    });

    const zipArrayBuffer = await zip.generateAsync({ type: "arraybuffer" });

    return new NextResponse(zipArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="generated-project.zip"',
        "X-Gemini-Requests": String(geminiCallCount),
        "X-Generated-Files": String(filesToGenerate.length),
        "X-Gemini-Keys": `${apiKeys.length - exhaustedKeys.size}/${apiKeys.length}`,
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
          message:
            "Gemini quota exhausted or rate-limited. Please wait and retry, or upgrade your plan.",
          retryAfter,
        },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }
    console.error("GEN ERROR:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Internal server error", detail: msg },
      { status: 500 },
    );
  }
}

async function planArchitectureAi(input: {
  nodes: unknown[];
  edges: unknown[];
  techStack?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  apiKeys: string[];
  exhaustedKeys: Set<number>;
  onRequest?: () => void;
}): Promise<{
  projectName: string;
  description: string;
  files: { path: string; description: string }[];
}> {
  const prompt = `
You are a senior software architect.

Your task:
Generate a COMPLETE production-ready backend project file structure
based on the provided architecture graph.

Requirements:
- Plan exact folders and files.
- Include config files.
- Include environment setup.
- Include database setup if needed.
- Include Docker if appropriate.
- Include package.json.
- Include README.
- Be realistic and production-grade.
- Every file must have a VERY DETAILED description of what it does.
- Do NOT generate code.
- Only generate the plan.

Return STRICT JSON only in this format:

{
  "projectName": "string",
  "description": "short high-level project summary",
  "files": [
    {
      "path": "relative/path/from-root.ext",
      "description": "very detailed explanation of this file's responsibility"
    }
  ]
}

No markdown.
No explanation outside JSON.

Here is the design:

${JSON.stringify(
  {
    nodes: input.nodes,
    edges: input.edges,
    techStack: input.techStack,
    metadata: input.metadata,
  },
  null,
  2,
)}
`;

  // Try each API key in order, skipping already-exhausted ones
  for (let i = 0; i < input.apiKeys.length; i++) {
    if (input.exhaustedKeys.has(i)) continue;

    try {
      const ai = new GoogleGenAI({ apiKey: input.apiKeys[i] });

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
      });
      input.onRequest?.();

      const text = response.text?.trim();

      if (!text) {
        throw new Error("Empty architecture plan response");
      }

      // Strip markdown code fences if model wraps JSON
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
      const retryAfter = getQuotaRetryAfter(error);
      if (retryAfter !== null) {
        console.warn(`PLAN: Key #${i + 1} quota exhausted, trying next...`);
        input.exhaustedKeys.add(i);
        continue; // try next key
      }
      // Non-quota error — don't retry with another key
      console.error("PLAN ARCHITECTURE ERROR:", error);
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Architecture planning failed: ${msg}`);
    }
  }

  // All keys exhausted
  throw new QuotaExceededError(60);
}

async function genCodeAi(input: {
  filePath: string;
  description: string;
  fullPlan: {
    projectName: string;
    description: string;
    files: { path: string; description: string }[];
  };
  apiKeys: string[];
  exhaustedKeys: Set<number>;
  /** Index of the preferred starting key (round-robin assignment). */
  startKeyIndex?: number;
  onRequest?: () => void;
}): Promise<string> {
  const prompt = `
You are a senior software engineer.

Your task:
Generate the FULL production-ready code for ONE file in a backend project.

Project Name:
${input.fullPlan.projectName}

Project Description:
${input.fullPlan.description}

Full File Structure:
${JSON.stringify(input.fullPlan.files, null, 2)}

Current File To Generate:
Path: ${input.filePath}

File Responsibility:
${input.description}

Strict Rules:
- Output ONLY raw code.
- No markdown.
- No explanations.
- No comments outside the file's normal code comments.
- Must be production-ready.
- Must be internally consistent with other files.
- Must follow modern best practices.
- If package.json -> include real dependencies.
- If config file -> make it realistic.
- If env usage -> use process.env properly.
- If TypeScript -> strict types.
- No placeholder text.
- No pseudo-code.

Generate complete code now.
`;

  // Try each API key starting from the round-robin assigned index,
  // wrapping around, and skipping already-exhausted keys.
  const n = input.apiKeys.length;
  const start = (input.startKeyIndex ?? 0) % n;

  for (let attempt = 0; attempt < n; attempt++) {
    const i = (start + attempt) % n;
    if (input.exhaustedKeys.has(i)) continue;

    try {
      const ai = new GoogleGenAI({ apiKey: input.apiKeys[i] });

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
      });
      input.onRequest?.();

      let text = response.text?.trim();

      if (!text) {
        throw new Error("Empty code generation response");
      }

      // Remove accidental markdown fences if model adds them
      text = text.replace(/```[\w]*\n?/g, "").replace(/```/g, "").trim();

      return text;
    } catch (error) {
      const retryAfter = getQuotaRetryAfter(error);
      if (retryAfter !== null) {
        console.warn(`CODE ${input.filePath}: Key #${i + 1} quota exhausted, trying next...`);
        input.exhaustedKeys.add(i);
        continue; // try next key
      }
      // Non-quota error — don't retry with another key
      console.error("CODE GENERATION ERROR:", error);
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Code generation failed for ${input.filePath}: ${msg}`);
    }
  }

  // All keys exhausted
  throw new QuotaExceededError(60);
}
