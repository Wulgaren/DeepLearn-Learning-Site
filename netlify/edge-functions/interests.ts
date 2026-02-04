import type { Config, Context } from "@netlify/edge-functions";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
    ? raw.filter((t): t is string => typeof t === "string").map((t) => String(t).trim()).filter(Boolean)
    : [];

  const { error: upsertError } = await supabase.from("user_interests").upsert(
    { user_id: userId, tags },
    { onConflict: "user_id" }
  );

  if (upsertError) {
    console.error("Interests upsert error:", upsertError);
    return jsonResponse({ error: "Failed to save interests" }, 500);
  }

  return jsonResponse({ tags });
}

export const config: Config = {
  path: "/api/interests",
};
