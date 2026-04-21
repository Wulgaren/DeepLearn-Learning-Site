import type { Config, Context } from "@netlify/edge-functions";
import { fetchMetPage } from "./lib/art-shared.ts";
import { clampWikidataPage } from "./lib/art-limits.ts";
import { corsHeaders, getUserId, jsonResponse, log } from "./lib/shared.ts";

const FN = "art-met";

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
  const pageRaw = url.searchParams.get("page");
  const parsed = parseInt(pageRaw ?? "0", 10);
  const page = clampWikidataPage(Number.isFinite(parsed) ? parsed : 0);

  try {
    const { items, nextPage } = await fetchMetPage(page);
    log(FN, "info", "ok", { page, count: items.length, nextPage });
    return jsonResponse({ items, nextPage });
  } catch (err) {
    log(FN, "error", "fetch failed", { error: err instanceof Error ? err.message : String(err) });
    return jsonResponse({ error: "Failed to load Met collection" }, 502);
  }
}

export const config: Config = {
  path: "/api/art-met",
};
