import type { Config, Context } from "@netlify/edge-functions";
import {
  corsHeaders,
  getUserId,
  jsonResponse,
  log,
  logAi,
  sanitizeForPrompt,
  groqCompletion,
} from "./lib/shared.ts";
import type { NormalizedArtwork } from "./lib/art-shared.ts";

const FN = "art-ask";

export default async function handler(req: Request, _context: Context): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const userId = getUserId(req);
  if (!userId) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let body: { artwork?: NormalizedArtwork; question?: string };
  try {
    body = req.body ? await req.json() : {};
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const rawQ = typeof body.question === "string" ? body.question.trim() : "";
  const question = sanitizeForPrompt(rawQ, 2000);
  if (!question) {
    return jsonResponse({ error: "Missing or invalid question" }, 400);
  }

  const a = body.artwork;
  if (!a || typeof a !== "object" || !a.source || typeof a.id !== "string") {
    return jsonResponse({ error: "Missing artwork" }, 400);
  }

  const groqApiKey = Deno.env.get("GROQ_API_KEY");
  if (!groqApiKey) {
    return jsonResponse({ error: "Server configuration error" }, 500);
  }

  const title = sanitizeForPrompt(String(a.title ?? ""), 500);
  const desc = sanitizeForPrompt(String(a.description ?? ""), 2000);
  const rights = sanitizeForPrompt(String(a.rights ?? ""), 500);
  const attr = sanitizeForPrompt(String(a.attribution ?? ""), 500);
  const artistLabel = sanitizeForPrompt(String(a.artist?.label ?? ""), 300);
  const src = a.source;

  const contextBlock = [
    `Source catalog: ${src}`,
    `Work ID: ${a.id}`,
    `Title: ${title}`,
    artistLabel ? `Artist (as labeled): ${artistLabel}` : "",
    desc ? `Description / medium / date (as given): ${desc}` : "",
    rights ? `Rights note (metadata): ${rights}` : "",
    attr ? `Attribution (metadata): ${attr}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = `You help a learner understand an artwork using ONLY general art-historical knowledge plus the metadata below. The metadata may be incomplete or wrong.

---METADATA---
${contextBlock}
---END---

User question: ${question}

Rules:
- Answer in plain language, 2–6 sentences unless a shorter list is clearly better.
- If something is uncertain, conflicting, or not in reliable sources, say so clearly.
- Do not invent specific dates, prices, owners, or exhibition history unless they are plausible general knowledge; prefer hedging.
- Do not claim you "saw" the image; you only have text metadata and general knowledge.
- No JSON, no markdown code fences.`;

  const model = "openai/gpt-oss-120b";
  log(FN, "info", "request", { model, source: src, id: a.id });

  try {
    const result = await groqCompletion(groqApiKey, {
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.5,
      max_tokens: 600,
    });
    const answer = (result.content ?? "").trim();
    logAi(FN, { model, rawResponse: answer, usage: result.usage });
    if (!answer) {
      return jsonResponse({ error: "AI returned an empty response" }, 502);
    }
    return jsonResponse({ answer });
  } catch (err) {
    logAi(FN, { model, error: err });
    return jsonResponse({ error: "AI service error" }, 502);
  }
}

export const config: Config = {
  path: "/api/art-ask",
};
