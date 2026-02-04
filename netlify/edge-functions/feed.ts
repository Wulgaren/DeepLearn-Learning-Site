import type { Config, Context } from "@netlify/edge-functions";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, getUserId, jsonResponse, log } from "./lib/shared.ts";

const FN = "feed";

export default async function handler(req: Request, _context: Context): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const userId = getUserId(req);
  if (!userId) {
    log(FN, "warn", "Unauthorized");
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  log(FN, "info", "request", { method: req.method });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseServiceKey) {
    return jsonResponse({ error: "Server configuration error" }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: topics, error: topicsError } = await supabase
    .from("topics")
    .select("id, query, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (topicsError) {
    log(FN, "error", "Topics error", topicsError);
    return jsonResponse({ error: "Failed to load feed" }, 500);
  }

  if (!topics?.length) {
    return jsonResponse({ topics: [], threadsByTopic: {} });
  }

  const topicIds = topics.map((t) => t.id);
  const { data: threads, error: threadsError } = await supabase
    .from("threads")
    .select("id, topic_id, main_post, replies, created_at")
    .in("topic_id", topicIds)
    .order("created_at", { ascending: true });

  if (threadsError) {
    log(FN, "error", "Threads error", threadsError);
    return jsonResponse({ error: "Failed to load threads" }, 500);
  }

  const threadsByTopic: Record<string, Array<{ id: string; main_post: string; replies: string[]; created_at: string }>> = {};
  for (const tid of topicIds) threadsByTopic[tid] = [];
  for (const t of threads || []) {
    const list = threadsByTopic[t.topic_id];
    if (list) list.push({ id: t.id, main_post: t.main_post, replies: t.replies ?? [], created_at: t.created_at });
  }

  log(FN, "info", "success", { topicsCount: topics.length, threadsCount: threads?.length ?? 0 });
  return jsonResponse({
    topics: topics.map((t) => ({ id: t.id, query: t.query, created_at: t.created_at })),
    threadsByTopic,
  });
}

export const config: Config = {
  path: "/api/feed",
};
