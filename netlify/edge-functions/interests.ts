import type { Config, Context } from "@netlify/edge-functions";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, getUserId, jsonResponse, sanitizeTag, MAX_TAGS_COUNT } from "./_shared.ts";

export default async function handler(req: Request, _context: Context): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "GET" && req.method !== "POST") {
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

  if (req.method === "GET") {
    const { data: row, error } = await supabase
      .from("user_interests")
      .select("tags")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("Interests get error:", error);
      return jsonResponse({ error: "Failed to load interests" }, 500);
    }
    const tags = Array.isArray(row?.tags) ? row.tags : [];
    return jsonResponse({ tags });
  }

  let body: { tags?: unknown };
  try {
    body = req.body ? await req.json() : {};
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  const raw = body.tags;
  const tags = Array.isArray(raw)
    ? raw
        .filter((t): t is string => typeof t === "string")
        .map((t) => sanitizeTag(t))
        .filter(Boolean)
        .slice(0, MAX_TAGS_COUNT)
    : [];

  const { error: upsertError } = await supabase.from("user_interests").upsert(
    { user_id: userId, tags },
    { onConflict: "user_id" }
  );

  if (upsertError) {
    console.error("Interests upsert error:", upsertError);
    return jsonResponse({ error: "Failed to save interests" }, 500);
  }

  await supabase.from("user_home_suggestions").upsert(
    { user_id: userId, suggestions: [] },
    { onConflict: "user_id" }
  );

  return jsonResponse({ tags });
}

export const config: Config = {
  path: "/api/interests",
};
