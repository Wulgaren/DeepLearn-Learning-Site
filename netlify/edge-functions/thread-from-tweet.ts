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

const FN = "thread-from-tweet";

const REPLIES_COUNT = 5;

function parseReplies(text: string): string[] {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?\s*```\s*$/i, "").trim();
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  cleaned = cleaned.replace(/,(\s*[}\]])/g, "$1");
  try {
    const parsed = JSON.parse(cleaned) as { replies?: unknown };
    const arr = Array.isArray(parsed?.replies) ? parsed.replies : [];
    return arr.filter((x): x is string => typeof x === "string").slice(0, REPLIES_COUNT);
  } catch {
    try {
      const repaired = cleaned.replace(/,(\s*[}\]])/g, "$1");
      const parsed = JSON.parse(repaired) as { replies?: unknown };
      const arr = Array.isArray(parsed?.replies) ? parsed.replies : [];
      return arr.filter((x): x is string => typeof x === "string").slice(0, REPLIES_COUNT);
    } catch {
      return [];
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

  let body: { tweet?: string };
  try {
    body = req.body ? await req.json() : {};
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  const rawTweet = typeof body.tweet === "string" ? body.tweet.trim() : "";
  const tweet = sanitizeForPrompt(rawTweet, 1000);
  if (!tweet) {
    return jsonResponse({ error: "Missing or empty tweet" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const groqApiKey = Deno.env.get("GROQ_API_KEY");
  if (!supabaseUrl || !supabaseServiceKey || !groqApiKey) {
    return jsonResponse({ error: "Server configuration error" }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let topicRow: { id: string } | null = null;
  const { data: existing } = await supabase
    .from("topics")
    .select("id")
    .eq("user_id", userId)
    .eq("query", "Home")
    .limit(1)
    .maybeSingle();

  if (existing) {
    topicRow = existing;
  } else {
    const { data: inserted, error: topicError } = await supabase
      .from("topics")
      .insert({ user_id: userId, query: "Home" })
      .select("id")
      .single();
    if (topicError || !inserted) {
      log(FN, "error", "Topic insert error", topicError);
      return jsonResponse({ error: "Failed to create topic" }, 500);
    }
    topicRow = inserted;
  }

  const mainPostForDb = sanitizeForDb(rawTweet, 1000);
  const { data: threadRow, error: threadError } = await supabase
    .from("threads")
    .insert({ topic_id: topicRow.id, main_post: mainPostForDb, replies: [] })
    .select("id")
    .single();

  if (threadError || !threadRow) {
    log(FN, "error", "Thread insert error", threadError);
    return jsonResponse({ error: "Failed to create thread" }, 500);
  }

  const classifierPrompt = `Does expanding this tweet into an informative thread require external or up-to-date information beyond general knowledge? (e.g. recent events, current stats, specific names/dates.) Reply with only YES or NO.

---TWEET---
${tweet}
---`;
  const useWebGrounding = await classifyNeedsWebGrounding(groqApiKey, classifierPrompt);
  const model = useWebGrounding ? GROQ_COMPOUND_MODEL : "openai/gpt-oss-120b";
  log(FN, "info", "request", { model, tweetLen: tweet.length });

  const prompt = `You are an expert educator. This is a single "tweet" (main post) that a reader clicked on. Generate exactly ${REPLIES_COUNT} reply posts that expand on it in a thread. Be factual and accurate: only state true, verifiable information. Use real people, real events, real studies—no invented examples. If something is uncertain, say so. Each reply 1–4 sentences, up to ~400 characters. Conversational, flowing sentences—no bullet lists.

---MAIN POST---
${tweet}
---END MAIN POST---

Return ONLY valid JSON, no markdown, in this exact shape:
{"replies":["...","...","...","...","..."]}

Rules: One JSON object only. No code fences. No newlines inside strings. Use single quotes for any quoted text inside a reply. No trailing commas.`;

  let raw: string;
  try {
    const result = await groqCompletion(groqApiKey, {
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 2048,
    });
    raw = result.content;
    logAi(FN, { model, rawResponse: raw, usage: result.usage });
  } catch (err) {
    logAi(FN, { model, error: err });
    return jsonResponse({ error: "AI service error" }, 502);
  }

  if (!raw) {
    log(FN, "error", "AI returned empty response", { model });
    return jsonResponse({ error: "AI returned an empty response. Please try again." }, 502);
  }

  const replies = parseReplies(raw);
  if (replies.length === 0) {
    log(FN, "error", "AI response could not be parsed or had no replies", { model, rawPreview: raw.slice(0, 200) });
    return jsonResponse({ error: "AI could not generate replies. Please try again." }, 502);
  }

  const { error: updateError } = await supabase.from("threads").update({ replies }).eq("id", threadRow.id);

  if (updateError) {
    log(FN, "error", "Thread update error", updateError);
    return jsonResponse({ error: "Failed to save replies" }, 500);
  }

  log(FN, "info", "success", { threadId: threadRow.id, repliesCount: replies.length });
  return jsonResponse({ threadId: threadRow.id });
}

export const config: Config = {
  path: "/api/thread-from-tweet",
};
