/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase client from createClient */
import {
  classifyNeedsWebGrounding,
  GROQ_COMPOUND_MODEL,
  groqCompletion,
  logAi,
} from "./shared.ts";

const REPLIES_COUNT = 5;

export function parseReplies(text: string): string[] {
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

/** Generate AI reply chain and persist to thread; clears expand_pending. */
export async function generateAndPersistReplies(
  supabase: any,
  groqApiKey: string,
  opts: {
    threadId: string;
    tweet: string;
    logFn: string;
  }
): Promise<{ ok: true; replyCount: number } | { ok: false; error: string; status: number }> {
  const { threadId, tweet, logFn } = opts;
  const classifierPrompt = `Does expanding this tweet into an informative thread require external or up-to-date information beyond general knowledge? (e.g. recent events, current stats, specific names/dates.) Reply with only YES or NO.

---TWEET---
${tweet}
---`;
  const useWebGrounding = await classifyNeedsWebGrounding(groqApiKey, classifierPrompt);
  const model = useWebGrounding ? GROQ_COMPOUND_MODEL : "openai/gpt-oss-120b";

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
    logAi(logFn, { model, rawResponse: raw, usage: result.usage });
  } catch (err) {
    logAi(logFn, { model, error: err });
    return { ok: false, error: "AI service error", status: 502 };
  }

  if (!raw) {
    return { ok: false, error: "AI returned an empty response. Please try again.", status: 502 };
  }

  const replies = parseReplies(raw);
  if (replies.length === 0) {
    return {
      ok: false,
      error: "AI could not generate replies. Please try again.",
      status: 502,
    };
  }

  const { error: updateError } = await supabase
    .from("threads")
    .update({ replies, expand_pending: false })
    .eq("id", threadId);

  if (updateError) {
    return { ok: false, error: "Failed to save replies", status: 500 };
  }

  return { ok: true, replyCount: replies.length };
}
