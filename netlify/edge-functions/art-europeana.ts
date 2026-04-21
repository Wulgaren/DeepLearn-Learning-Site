import type { Config, Context } from "@netlify/edge-functions";
import { fetchEuropeanaPage } from "./lib/art-shared.ts";
import { clampArtSearchQuery, clampEuropeanaCursorParam } from "./lib/art-limits.ts";
import { corsHeaders, getUserId, jsonResponse, log } from "./lib/shared.ts";

const FN = "art-europeana";

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

  const url = new URL(req.url);
  const cursor = clampEuropeanaCursorParam(url.searchParams.get("cursor"));
  const query = clampArtSearchQuery(url.searchParams.get("q") ?? "painting") || "painting";

  if (!Deno.env.get("EUROPEANA_API_KEY")) {
    return jsonResponse({ error: "Europeana is not configured" }, 503);
  }

  try {
    const { items, nextCursor } = await fetchEuropeanaPage(cursor, query);
    log(FN, "info", "ok", { count: items.length, hasNext: !!nextCursor });
    return jsonResponse({ items, nextCursor });
  } catch (err) {
    log(FN, "error", "fetch failed", { error: err instanceof Error ? err.message : String(err) });
    return jsonResponse({ error: "Failed to load Europeana" }, 502);
  }
}

export const config: Config = {
  path: "/api/art-europeana",
};
