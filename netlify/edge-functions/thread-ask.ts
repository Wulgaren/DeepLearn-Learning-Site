import type { Config, Context } from "@netlify/edge-functions";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  corsHeaders,
  getUserId,
  jsonResponse,
  log,
  logAi,
  validateUuid,
  sanitizeForPrompt,
  sanitizeForDb,
  groqCompletion,
  classifyNeedsWebGrounding,
  GROQ_COMPOUND_MODEL,
} from "./lib/shared.ts";

const FN = "thread-ask";

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

  let body: { threadId?: string; question?: string; replyContext?: string; replyIndex?: number | null };
  try {
    body = req.body ? await req.json() : {};
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  const threadId = body.threadId;
  if (!validateUuid(threadId)) {
    return jsonResponse({ error: "Invalid thread" }, 400);
  }
  const rawQuestion = typeof body.question === "string" ? body.question.trim() : "";
  const question = sanitizeForPrompt(rawQuestion, 2000);
  if (!question) {
    return jsonResponse({ error: "Missing or invalid question" }, 400);
  }
  const rawReplyContext = typeof body.replyContext === "string" ? body.replyContext.trim() : undefined;
  const replyContext = rawReplyContext ? sanitizeForPrompt(rawReplyContext, 2000) : undefined;
  const replyIndex = typeof body.replyIndex === "number" && body.replyIndex >= 0 ? body.replyIndex : null;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const groqApiKey = Deno.env.get("GROQ_API_KEY");
  if (!supabaseUrl || !supabaseServiceKey || !groqApiKey) {
    return jsonResponse({ error: "Server configuration error" }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: thread, error: threadError } = await supabase
    .from("threads")
    .select("id, topic_id, main_post, replies")
    .eq("id", threadId)
    .single();

  if (threadError || !thread) {
    return jsonResponse({ error: "Thread not found" }, 404);
  }

  const { data: topic } = await supabase.from("topics").select("id, user_id").eq("id", thread.topic_id).single();
  if (!topic || topic.user_id !== userId) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  const repliesRaw = (thread.replies ?? []) as Array<string | { type?: string; content?: string }>;
  const mainSafe = sanitizeForPrompt(String(thread.main_post ?? ""), 4000);
  const replyLines = repliesRaw.map((r, i) => {
    const text = typeof r === "string" ? r : String(r?.content ?? "");
    return `Reply ${i + 1}: ${sanitizeForPrompt(text, 4000)}`;
  });
  const context = ["Thread (main): " + mainSafe, ...replyLines].join("\n");

  const contextNote = replyContext
    ? `\nThe user is asking specifically about this part of the thread: «${replyContext}»\nAnswer in that context.\n\n`
    : "";
  const prompt = `You are an informative, friendly tutor. Given this thread:

---BEGIN THREAD---
${context}
---END THREAD---

${contextNote}---USER QUESTION---
${question}
---END USER QUESTION---

Reply in 1–4 clear sentences. Be helpful and conversational. Only state factual, verifiable information—use real examples, real names, real studies. Do not invent or speculate; if unsure, say so. No JSON, no quotes—just the reply text.`;

  const classifierPrompt = `Given this thread and the user's question, does answering accurately require external or up-to-date information that is NOT in the thread? (e.g. recent events, specific numbers, names, dates, or facts beyond the thread.) Reply with only YES or NO.

---THREAD---
${context.slice(0, 2000)}
---QUESTION---
${question}
---`;
  const useWebGrounding = await classifyNeedsWebGrounding(groqApiKey, classifierPrompt);
  const model = useWebGrounding ? GROQ_COMPOUND_MODEL : "openai/gpt-oss-120b";
  log(FN, "info", "request", { threadId, model, questionLen: question.length });

  let answer: string;
  try {
    const result = await groqCompletion(groqApiKey, {
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.6,
      max_tokens: 400,
    });
    answer = result.content;
    logAi(FN, { model, rawResponse: answer, usage: result.usage });
  } catch (err) {
    logAi(FN, { model, error: err });
    return jsonResponse({ error: "AI service error" }, 502);
  }

  if (!answer || answer.length < 2) {
    log(FN, "error", "AI returned empty or invalid reply", { model });
    return jsonResponse({ error: "AI returned an empty response. Please try again." }, 502);
  }

  const insertAt = replyIndex === null ? repliesRaw.length : replyIndex + 1;
  const safeQuestion = sanitizeForDb(rawQuestion, 2000);
  const safeAnswer = sanitizeForDb(answer, 8000);
  const newReplies = [
    ...repliesRaw.slice(0, insertAt),
    { type: "user", content: safeQuestion },
    { type: "ai", content: safeAnswer },
    ...repliesRaw.slice(insertAt),
  ];

  const { error: updateError } = await supabase.from("threads").update({ replies: newReplies }).eq("id", threadId);

  if (updateError) {
    log(FN, "error", "Thread update error", updateError);
    return jsonResponse({ error: "Failed to save reply" }, 500);
  }

  log(FN, "info", "success", { threadId });
  return jsonResponse({ answer });
}

export const config: Config = {
  path: "/api/thread-ask",
};
