import type { Config, Context } from "@netlify/edge-functions";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, getUserId, jsonResponse, log } from "./lib/shared.ts";

const FN = "art-threads";

export default async function handler(req: Request, _context: Context): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const userId = await getUserId(req);
  if (!userId) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseServiceKey) {
    return jsonResponse({ error: "Server configuration error" }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: topic } = await supabase
    .from("topics")
    .select("id")
    .eq("user_id", userId)
    .eq("query", "Art")
    .limit(1)
    .maybeSingle();

  if (!topic) {
    return jsonResponse({ threads: [] });
  }

  const { data: rows, error } = await supabase
    .from("threads")
    .select(
      "id, main_post, replies, created_at, main_image_url, catalog_url, art_source, art_external_id, expand_pending"
    )
    .eq("topic_id", topic.id)
    .order("created_at", { ascending: false });

  if (error) {
    log(FN, "error", error);
    return jsonResponse({ error: "Failed to load art threads" }, 500);
  }

  const list = (rows ?? []).map((t) => ({
    id: t.id,
    main_post: t.main_post,
    replies: t.replies ?? [],
    created_at: t.created_at,
    main_image_url: t.main_image_url ?? null,
    catalog_url: t.catalog_url ?? null,
    art_source: t.art_source ?? null,
    art_external_id: t.art_external_id ?? null,
    expand_pending: Boolean(t.expand_pending),
  }));

  log(FN, "info", "success", { n: list.length });
  return jsonResponse({ threads: list });
}

export const config: Config = {
  path: "/api/art-threads",
};
