import type { Config, Context } from "@netlify/edge-functions";
import { corsHeaders, jsonResponse, log } from "./lib/shared.ts";
import { fetchWikidataPage } from "./lib/art-shared.ts";

const FN = "art-wikidata";

export default async function handler(req: Request, _context: Context): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const url = new URL(req.url);
  const pageRaw = url.searchParams.get("page");
  const page = Math.max(0, parseInt(pageRaw ?? "0", 10) || 0);

  try {
    const { items, nextPage } = await fetchWikidataPage(page);
    log(FN, "info", "ok", { page, count: items.length });
    return jsonResponse({ items, nextPage });
  } catch (err) {
    log(FN, "error", "fetch failed", { error: err instanceof Error ? err.message : String(err) });
    return jsonResponse({ error: "Failed to load Wikidata" }, 502);
  }
}

export const config: Config = {
  path: "/api/art-wikidata",
};
