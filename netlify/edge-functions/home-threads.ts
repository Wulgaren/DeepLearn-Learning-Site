import type { Config, Context } from "@netlify/edge-functions";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, getUserId, jsonResponse } from "./lib/shared.ts";

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

  const { data: topic, error: topicError } = await supabase
    .from("topics")
    .select("id")
    .eq("user_id", userId)
    .eq("query", "Home")
    .limit(1)
    .maybeSingle();

  if (topicError || !topic) {
    return jsonResponse({ threads: [] });
  }

  const { data: threads, error: threadsError } = await supabase
    .from("threads")
    .select("id, main_post, replies, created_at")
    .eq("topic_id", topic.id)
    .order("created_at", { ascending: false });

  if (threadsError) {
    console.error("Home threads error:", threadsError);
    return jsonResponse({ error: "Failed to load threads" }, 500);
  }

  const list = (threads ?? []).map((t) => ({
    id: t.id,
    main_post: t.main_post,
    replies: t.replies ?? [],
    created_at: t.created_at,
  }));

  return jsonResponse({ threads: list });
}

export const config: Config = {
  path: "/api/home-threads",
};
