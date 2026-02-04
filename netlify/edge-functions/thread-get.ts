import type { Config, Context } from "@netlify/edge-functions";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, getUserId, jsonResponse, log, validateUuid } from "./lib/shared.ts";

const FN = "thread-get";

export default async function handler(req: Request, _context: Context): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const url = new URL(req.url);
  const threadId = url.searchParams.get("threadId");
  if (!threadId || !validateUuid(threadId)) {
    log(FN, "warn", "Invalid or missing threadId");
    return jsonResponse({ error: "Invalid or missing thread" }, 400);
  }
  log(FN, "info", "request", { threadId });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseServiceKey) {
    return jsonResponse({ error: "Server configuration error" }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: thread, error: threadError } = await supabase
    .from("threads")
    .select("id, topic_id, main_post, replies, created_at")
    .eq("id", threadId)
    .single();

  if (threadError || !thread) {
    log(FN, "warn", "Thread not found", { threadId, error: threadError });
    return jsonResponse({ error: "Thread not found" }, 404);
  }

  // Allow viewing by link without auth; ownership check only when authenticated
  const userId = getUserId(req);
  if (userId) {
    const { data: topic } = await supabase.from("topics").select("id, user_id").eq("id", thread.topic_id).single();
    if (!topic || topic.user_id !== userId) {
      log(FN, "warn", "Forbidden", { threadId });
      return jsonResponse({ error: "Forbidden" }, 403);
    }
  }

  log(FN, "info", "success", { threadId: thread.id });
  return jsonResponse({
    thread: {
      id: thread.id,
      topic_id: thread.topic_id,
      main_post: thread.main_post,
      replies: thread.replies ?? [],
      created_at: thread.created_at,
    },
  });
}

export const config: Config = {
  path: "/api/thread-get",
};
