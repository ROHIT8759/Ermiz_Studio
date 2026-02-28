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

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY not configured" },
        { status: 500 },
      );
    }

    // 1) Plan architecture
    const architecturePlan = await planArchitectureAi({
      nodes: body.nodes,
      edges: body.edges,
      techStack: body.techStack,
      metadata: body.metadata,
      apiKey: process.env.GEMINI_API_KEY!,
    });

    if (!architecturePlan?.files || !Array.isArray(architecturePlan.files)) {
      return NextResponse.json(
        { error: "Invalid architecture plan returned by AI" },
        { status: 500 },
      );
    }

    // 2) Generate code files in parallel (cap at 20 to avoid timeout)
    const filesToGenerate = architecturePlan.files.slice(0, 20);
    const generatedEntries = await Promise.all(
      filesToGenerate.map(async (file) => {
        const code = await genCodeAi({
          filePath: file.path,
          description: file.description,
          fullPlan: architecturePlan,
          apiKey: process.env.GEMINI_API_KEY!,
        });
        return [file.path, code] as const;
      }),
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
  apiKey: string;
}): Promise<{
  projectName: string;
  description: string;
  files: { path: string; description: string }[];
}> {
  try {
    const ai = new GoogleGenAI({
      apiKey: input.apiKey,
    });

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

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
    });

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
    console.error("PLAN ARCHITECTURE ERROR:", error);
    const retryAfter = getQuotaRetryAfter(error);
    if (retryAfter !== null) {
      throw new QuotaExceededError(retryAfter);
    }
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Architecture planning failed: ${msg}`);
  }
}

async function genCodeAi(input: {
  filePath: string;
  description: string;
  fullPlan: {
    projectName: string;
    description: string;
    files: { path: string; description: string }[];
  };
  apiKey: string;
}): Promise<string> {
  try {
    const ai = new GoogleGenAI({
      apiKey: input.apiKey,
    });

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

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
    });

    let text = response.text?.trim();

    if (!text) {
      throw new Error("Empty code generation response");
    }

    // Remove accidental markdown fences if model adds them
    text = text.replace(/```[\w]*\n?/g, "").replace(/```/g, "").trim();

    return text;
  } catch (error) {
    console.error("CODE GENERATION ERROR:", error);
    const retryAfter = getQuotaRetryAfter(error);
    if (retryAfter !== null) {
      throw new QuotaExceededError(retryAfter);
    }
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Code generation failed for ${input.filePath}: ${msg}`);
  }
}
