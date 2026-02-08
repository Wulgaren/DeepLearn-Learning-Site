import type { Config, Context } from "@netlify/edge-functions";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  corsHeaders,
  getUserId,
  jsonResponse,
  log,
  logAi,
  sanitizeForPrompt,
  groqCompletion,
} from "./lib/shared.ts";

const FN = "home-tweets";

const MAX_TWEETS = 10;
const MAX_ALREADY_COVERED_IN_PROMPT = 30;

function parseTweets(text: string): string[] {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?\s*```\s*$/i, "").trim();
  const firstBracket = cleaned.indexOf("[");
  const lastBracket = cleaned.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    cleaned = cleaned.slice(firstBracket, lastBracket + 1);
  }
  cleaned = cleaned.replace(/,(\s*[}\]])/g, "$1");
  try {
    const arr = JSON.parse(cleaned);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string").slice(0, MAX_TWEETS) : [];
  } catch {
    try {
      const repaired = cleaned.replace(/,(\s*[}\]])/g, "$1");
      const arr = JSON.parse(repaired);
      return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string").slice(0, MAX_TWEETS) : [];
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

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const groqApiKey = Deno.env.get("GROQ_API_KEY");
  if (!supabaseUrl || !supabaseServiceKey || !groqApiKey) {
    return jsonResponse({ error: "Server configuration error" }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: interestsRow, error: interestsError } = await supabase
    .from("user_interests")
    .select("tags")
    .eq("user_id", userId)
    .maybeSingle();

  if (interestsError) {
    log(FN, "error", "Interests fetch error", interestsError);
    return jsonResponse({ error: "Failed to load interests" }, 500);
  }

  const rawInterests = Array.isArray(interestsRow?.tags) ? interestsRow.tags : [];
  const interests = rawInterests
    .filter((t): t is string => typeof t === "string")
    .map((t) => sanitizeForPrompt(String(t).trim(), 80))
    .filter(Boolean);
  if (interests.length === 0) {
    log(FN, "info", "No interests, returning empty tweets");
    return jsonResponse({ tweets: [] });
  }

  const { data: homeTopic } = await supabase
    .from("topics")
    .select("id")
    .eq("user_id", userId)
    .eq("query", "Home")
    .limit(1)
    .maybeSingle();

  const threadMainPosts: string[] = [];
  if (homeTopic) {
    const { data: threads } = await supabase
      .from("threads")
      .select("main_post")
      .eq("topic_id", homeTopic.id);
    if (threads?.length) {
      threads.forEach((t) => {
        if (typeof t.main_post === "string" && t.main_post.trim()) threadMainPosts.push(t.main_post.trim());
      });
    }
  }

  const { data: suggestionsRow } = await supabase
    .from("user_home_suggestions")
    .select("suggestions")
    .eq("user_id", userId)
    .maybeSingle();

  const storedSuggestions = Array.isArray(suggestionsRow?.suggestions) ? suggestionsRow.suggestions : [];
  const alreadyCovered = Array.from(new Set([...threadMainPosts, ...storedSuggestions].filter(Boolean))).slice(
    0,
    MAX_ALREADY_COVERED_IN_PROMPT
  );

  const alreadyCoveredBlock =
    alreadyCovered.length > 0
      ? `\n\nIMPORTANT: The user has already been shown or has opened threads for these topics. Do NOT suggest anything similar or duplicate. Generate only NEW, different ideas:\n---ALREADY COVERED---\n${alreadyCovered.map((s) => sanitizeForPrompt(String(s).replace(/\n/g, " "), 200)).join("\n")}\n---END---\n`
      : "";

  log(FN, "info", "request", { interestsCount: interests.length });

  const prompt = `---USER INTERESTS---
${interests.join(", ")}
---END USER INTERESTS---
${alreadyCoveredBlock}

Generate between 5 and ${MAX_TWEETS} short "tweet" ideas that would make this reader want to click and learn more. Each tweet should be an engaging, educational hook (1–2 sentences, under 280 characters). Base ideas on real, factual topics—real concepts, real history, real science, real people or works. Do not invent or speculate. Mix angles: surprising facts, how-to hooks, "why X matters", or intriguing questions.

Return ONLY a JSON array of strings, nothing else. No markdown, no code fences, no explanation. Example format:
["First tweet text here.","Second tweet here.",...]

Rules: Use single quotes inside strings if needed; avoid unescaped double quotes inside the tweet text. No trailing comma.`;

  const model = "openai/gpt-oss-120b";
  let raw: string;
  try {
    const result = await groqCompletion(groqApiKey, {
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8,
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

  const newTweets = parseTweets(raw);
  const merged = Array.from(new Set([...storedSuggestions, ...newTweets].filter(Boolean)));

  const { error: upsertError } = await supabase.from("user_home_suggestions").upsert(
    { user_id: userId, suggestions: merged },
    { onConflict: "user_id" }
  );

  if (upsertError) {
    log(FN, "error", "Home suggestions upsert error", upsertError);
    return jsonResponse({ error: "Failed to save suggestions" }, 500);
  }

  log(FN, "info", "success", { tweetsCount: merged.length });
  return jsonResponse({ tweets: merged.slice().reverse() });
}

export const config: Config = {
  path: "/api/home-tweets",
};
