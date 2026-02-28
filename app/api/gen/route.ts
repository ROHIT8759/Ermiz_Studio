import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { Edge } from "@xyflow/react";
import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";

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

    // 1️⃣ Validate Design
    const validation = await validateDesign({
      nodes: body.nodes,
      edges: body.edges,
      techStack: body.techStack,
      metadata: body.metadata,
      apiKey: process.env.GEMINI_API_KEY!,
    });

    if (!validation?.isValid) {
      return NextResponse.json(
        {
          error: "Design is not valid",
          reason: validation?.reason || "Unknown validation error",
        },
        { status: 400 },
      );
    }

    // 2️⃣ Plan Architecture
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

    // 3️⃣ Generate Code File-by-File
    const generatedFiles: Record<string, string> = {};

    for (const file of architecturePlan.files) {
      const fileCode = await genCodeAi({
        filePath: file.path,
        description: file.description,
        fullPlan: architecturePlan,
        apiKey: process.env.GEMINI_API_KEY!,
      });

      generatedFiles[file.path] = fileCode;
    }

    // 4️⃣ Zip All Files
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
    console.error("GEN ERROR:", error);

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

async function validateDesign(input: {
  nodes: unknown[];
  edges: unknown[];
  techStack?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  apiKey: string;
}): Promise<{ isValid: boolean; reason?: string }> {
  try {
    const ai = new GoogleGenAI({
      apiKey: input.apiKey,
    });

    const prompt = `
You are a senior backend systems architect.

Your task:
Validate whether the provided backend architecture design is technically feasible and internally consistent.

Consider:
- Are dependencies logically valid?
- Are components compatible?
- Are there impossible architectural constraints?
- Is the tech stack compatible with the design?
- Any missing critical components?

Return STRICT JSON only in this format:

{
  "isValid": boolean,
  "reason": "Short simple explanation if invalid, otherwise null"
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
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const text = response.text?.trim();

    if (!text) {
      return {
        isValid: false,
        reason: "AI returned empty validation response",
      };
    }

    // Strip markdown code fences if model wraps JSON
    const clean = text.replace(/```[\w]*\n?/g, "").replace(/```/g, "").trim();

    // Attempt safe JSON parse
    const parsed = JSON.parse(clean);

    return {
      isValid: Boolean(parsed.isValid),
      reason: parsed.reason || undefined,
    };
  } catch (error) {
    console.error("VALIDATION ERROR:", error);

    return {
      isValid: false,
      reason: "Validation process failed",
    };
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
      model: "gemini-2.5-pro", // stronger reasoning for planning
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
    throw new Error("Architecture planning failed");
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
- If package.json → include real dependencies.
- If config file → make it realistic.
- If env usage → use process.env properly.
- If TypeScript → strict types.
- No placeholder text.
- No pseudo-code.

Generate complete code now.
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: prompt,
    });

    let text = response.text?.trim();

    if (!text) {
      throw new Error("Empty code generation response");
    }

    // Remove accidental markdown fences if model adds them
    text = text
      .replace(/```[\w]*\n?/g, "")
      .replace(/```/g, "")
      .trim();

    return text;
  } catch (error) {
    console.error("CODE GENERATION ERROR:", error);
    throw new Error(`Code generation failed for ${input.filePath}`);
  }
}
