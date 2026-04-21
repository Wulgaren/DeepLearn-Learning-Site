import type { Config, Context } from "@netlify/edge-functions";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, getUserId, jsonResponse, log, sanitizeForPrompt, validateUuid } from "./lib/shared.ts";
import { generateAndPersistReplies } from "./lib/thread-ai-replies.ts";

const FN = "thread-expand-replies";

export default async function handler(req: Request, _context: Context): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const userId = await getUserId(req);
  if (!userId) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let body: { threadId?: string };
  try {
    body = req.body ? await req.json() : {};
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  const threadId = typeof body.threadId === "string" ? body.threadId.trim() : "";
  if (!threadId || !validateUuid(threadId)) {
    return jsonResponse({ error: "Invalid thread" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const groqApiKey = Deno.env.get("GROQ_API_KEY");
  if (!supabaseUrl || !supabaseServiceKey || !groqApiKey) {
    return jsonResponse({ error: "Server configuration error" }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: row, error: fetchError } = await supabase
    .from("threads")
    .select("id, topic_id, main_post, expand_pending")
    .eq("id", threadId)
    .single();

  if (fetchError || !row) {
    log(FN, "warn", "Thread not found", { threadId });
    return jsonResponse({ error: "Thread not found" }, 404);
  }

  const { data: topicRow } = await supabase
    .from("topics")
    .select("user_id")
    .eq("id", row.topic_id)
    .single();

  if (!topicRow || topicRow.user_id !== userId) {
    return jsonResponse({ error: "Thread not found" }, 404);
  }

  if (!row.expand_pending) {
    return jsonResponse({ expanded: false, reason: "already_done" });
  }

  const tweet = sanitizeForPrompt(String(row.main_post ?? ""), 1000);
  if (!tweet) {
    return jsonResponse({ error: "Empty main post" }, 400);
  }

  const result = await generateAndPersistReplies(supabase, groqApiKey, {
    threadId: row.id,
    tweet,
    logFn: FN,
  });

  if (!result.ok) {
    return jsonResponse({ error: result.error }, result.status);
  }

  log(FN, "info", "success", { threadId: row.id });
  return jsonResponse({ expanded: true, replyCount: result.replyCount });
}

export const config: Config = {
  path: "/api/thread-expand-replies",
};
