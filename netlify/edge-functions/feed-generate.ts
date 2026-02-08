import type { Config, Context } from "@netlify/edge-functions";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  corsHeaders,
  getUserId,
  jsonResponse,
  log,
  logAi,
  sanitizeForPrompt,
  sanitizeForDb,
  groqCompletion,
  classifyNeedsWebGrounding,
  GROQ_COMPOUND_MODEL,
} from "./lib/shared.ts";

const FN = "feed-generate";

const THREADS_COUNT = 6;
const REPLIES_PER_THREAD = 5;

function extractAndParse(rawText: string): { threads?: Array<{ main?: string; replies?: string[] }> } | null {
  let cleaned = rawText.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?\s*```\s*$/i, "").trim();
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  cleaned = cleaned.replace(/,(\s*[}\]])/g, "$1");
  try {
    return JSON.parse(cleaned) as { threads?: Array<{ main?: string; replies?: string[] }> };
  } catch {
    try {
      const repaired = cleaned.replace(/,(\s*[}\]])/g, "$1");
      return JSON.parse(repaired) as { threads?: Array<{ main?: string; replies?: string[] }> };
    } catch {
      return null;
    }
  }
}

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

  let body: { topic?: string };
  try {
    body = req.body ? await req.json() : {};
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  const rawTopic = typeof body.topic === "string" ? body.topic.trim() : "";
  const topic = sanitizeForPrompt(rawTopic, 500);
  if (!topic) {
    return jsonResponse({ error: "Missing or empty topic" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const groqApiKey = Deno.env.get("GROQ_API_KEY");
  if (!supabaseUrl || !supabaseServiceKey || !groqApiKey) {
    return jsonResponse({ error: "Server configuration error" }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const classifierPrompt = `Does generating informative, accurate content for the following topic require external or up-to-date information beyond general knowledge? (e.g. recent events, current stats, breaking news.) Reply with only YES or NO.

---TOPIC---
${topic}
---`;
  const useWebGrounding = await classifyNeedsWebGrounding(groqApiKey, classifierPrompt);
  const model = useWebGrounding ? GROQ_COMPOUND_MODEL : "openai/gpt-oss-120b";
  log(FN, "info", "request", { model, topic });

  const prompt = `You are an expert educator. Generate exactly ${THREADS_COUNT} informative threads about the topic below.

---TOPIC---
${topic}
---END TOPIC---

Each thread has one main post (a clear hook or key idea, 1–2 sentences) and ${REPLIES_PER_THREAD} reply posts that expand on it. Requirements:
- Be factual and accurate. Only state information that is true and verifiable. Use real people, real events, real studies, real works—no invented examples or speculation. If something is uncertain, say so.
- Be substantive and informative. Explain concepts clearly; avoid one-line definitions or vague bullets.
- Include real-life examples where they fit: actual names, events, inventions, historical moments, or published research.
- Each main post or reply can be 1–4 sentences (up to ~400 characters each). Prioritize clarity and usefulness over brevity.
- Keep a conversational but knowledgeable tone. No bullet lists—write in flowing sentences.

Return ONLY valid JSON, no markdown or explanation, in this exact shape:
{"threads":[{"main":"...","replies":["...","...","...","...","..."]},{"main":"...","replies":["...","...","...","...","..."]}, ...]}

Rules: Output a single JSON object only. Do not wrap in code fences. Do not put actual newline characters inside any string—keep each main and replies item on one line. Never use the double-quote character inside any main or reply string (use single quotes for titles and quoted speech, e.g. 'The Artist is Present'). No trailing commas. Make the content educational, engaging, and worth reading.`;

  let raw: string;
  try {
    const result = await groqCompletion(groqApiKey, {
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 8192,
    });
    raw = result.content;
    logAi(FN, { model, rawResponse: raw, usage: result.usage });
  } catch (err) {
    logAi(FN, { model, error: err });
    return jsonResponse({ error: "AI service error" }, 502);
  }

  const parsed = extractAndParse(raw);
  if (!parsed) {
    log(FN, "error", "Failed to parse AI response", { model, rawPreview: raw.slice(0, 500) });
    return jsonResponse({ error: "Invalid AI response format" }, 502);
  }

  const threads = Array.isArray(parsed.threads) ? parsed.threads : [];
  if (threads.length === 0) {
    return jsonResponse({ error: "No threads generated" }, 502);
  }

  const topicForDb = sanitizeForDb(rawTopic, 500);
  const { data: topicRow, error: topicError } = await supabase
    .from("topics")
    .insert({ user_id: userId, query: topicForDb })
    .select("id")
    .single();

  if (topicError || !topicRow) {
    log(FN, "error", "Topic insert error", topicError);
    return jsonResponse({ error: "Failed to save topic" }, 500);
  }

  const threadRows = threads.slice(0, THREADS_COUNT).map((t) => ({
    topic_id: topicRow.id,
    main_post: typeof t.main === "string" ? t.main : "No content",
    replies: Array.isArray(t.replies) ? t.replies : [],
  }));

  const { data: insertedThreads, error: threadsError } = await supabase
    .from("threads")
    .insert(threadRows)
    .select("id, main_post, replies, created_at");

  if (threadsError || !insertedThreads?.length) {
    log(FN, "error", "Threads insert error", threadsError);
    return jsonResponse({ error: "Failed to save threads" }, 500);
  }

  log(FN, "info", "success", { topicId: topicRow.id, threadIds: insertedThreads.map((t) => t.id) });
  return jsonResponse({
    topicId: topicRow.id,
    threadIds: insertedThreads.map((t) => t.id),
    threads: insertedThreads,
  });
}

export const config: Config = {
  path: "/api/feed-generate",
};
