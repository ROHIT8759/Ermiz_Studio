import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ hint: "GROQ_API_KEY not configured." }, { status: 200 });
  }

  let title = "";
  let detail = "";
  try {
    const body = await req.json();
    title = String(body.title ?? "");
    detail = String(body.detail ?? "");
  } catch {
    return NextResponse.json({ hint: "" }, { status: 400 });
  }

  if (!title.trim()) {
    return NextResponse.json({ hint: "" }, { status: 400 });
  }

  try {
    const groq = new Groq({ apiKey });
    const prompt =
      `You are an expert software architect reviewing a backend architecture diagram.\n` +
      `A validation check flagged the following issue:\n` +
      `Error: "${title}"\n` +
      (detail ? `Detail: "${detail}"\n` : "") +
      `\nProvide a single, concise fix suggestion (1–2 sentences, no markdown, plain text). ` +
      `Be specific about what the user should do in the properties panel to resolve this.`;

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 120,
      temperature: 0.3,
    });

    const hint = completion.choices[0]?.message?.content?.trim() ?? "";
    return NextResponse.json({ hint });
  } catch (err) {
    console.error("[fix-hint] Groq error:", err);
    return NextResponse.json({ hint: "" });
  }
}
