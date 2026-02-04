import type { Config, Context } from "@netlify/edge-functions";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function getUserId(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

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
    console.error("Topics error:", topicsError);
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
    console.error("Threads error:", threadsError);
    return jsonResponse({ error: "Failed to load threads" }, 500);
  }

  const threadsByTopic: Record<string, Array<{ id: string; main_post: string; replies: string[]; created_at: string }>> = {};
  for (const tid of topicIds) threadsByTopic[tid] = [];
  for (const t of threads || []) {
    const list = threadsByTopic[t.topic_id];
    if (list) list.push({ id: t.id, main_post: t.main_post, replies: t.replies ?? [], created_at: t.created_at });
  }

  return jsonResponse({
    topics: topics.map((t) => ({ id: t.id, query: t.query, created_at: t.created_at })),
    threadsByTopic,
  });
}

export const config: Config = {
  path: "/api/feed",
};
