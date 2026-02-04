import type { Config, Context } from "@netlify/edge-functions";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, getUserId, jsonResponse } from "./_shared.ts";

export default async function handler(req: Request, _context: Context): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const userId = getUserId(req);
  if (!userId) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const url = new URL(req.url);
  const threadId = url.searchParams.get("threadId");
  if (!threadId) {
    return jsonResponse({ error: "Missing threadId" }, 400);
  }

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
    return jsonResponse({ error: "Thread not found" }, 404);
  }

  const { data: topic } = await supabase.from("topics").select("id, user_id").eq("id", thread.topic_id).single();
  if (!topic || topic.user_id !== userId) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  const { data: followUps } = await supabase
    .from("follow_ups")
    .select("id, user_question, ai_answer, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  return jsonResponse({
    thread: {
      id: thread.id,
      topic_id: thread.topic_id,
      main_post: thread.main_post,
      replies: thread.replies ?? [],
      created_at: thread.created_at,
    },
    followUps: followUps ?? [],
  });
}

export const config: Config = {
  path: "/api/thread-get",
};
