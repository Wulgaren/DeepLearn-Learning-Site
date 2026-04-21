import type { Config, Context } from "@netlify/edge-functions";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  corsHeaders,
  getUserId,
  jsonResponse,
  log,
  sanitizeForPrompt,
  sanitizeForDb,
} from "./lib/shared.ts";
import { MAX_ART_EXTERNAL_ID_LEN } from "./lib/art-limits.ts";
import { generateAndPersistReplies } from "./lib/thread-ai-replies.ts";

const FN = "thread-from-tweet";

const ART_SOURCES = new Set(["met", "europeana", "wikidata"]);

function normalizeArtSource(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  return ART_SOURCES.has(s) ? s : null;
}

async function getOrCreateTopic(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  query: string
): Promise<{ id: string } | null> {
  const { data: existing } = await supabase
    .from("topics")
    .select("id")
    .eq("user_id", userId)
    .eq("query", query)
    .limit(1)
    .maybeSingle();

  if (existing) return existing;

  const { data: inserted, error: topicError } = await supabase
    .from("topics")
    .insert({ user_id: userId, query })
    .select("id")
    .single();
  if (topicError || !inserted) {
    log(FN, "error", "Topic insert error", topicError);
    return null;
  }
  return inserted;
}

export default async function handler(req: Request, _context: Context): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const userId = getUserId(req);
  if (!userId) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let body: {
    tweet?: string;
    mainImageUrl?: string;
    catalogUrl?: string;
    deferReplies?: boolean;
    artSource?: string;
    artExternalId?: string;
  };
  try {
    body = req.body ? await req.json() : {};
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  const rawTweet = typeof body.tweet === "string" ? body.tweet.trim() : "";
  const tweet = sanitizeForPrompt(rawTweet, 1000);
  if (!tweet) {
    return jsonResponse({ error: "Missing or empty tweet" }, 400);
  }
  const rawImg = typeof body.mainImageUrl === "string" ? body.mainImageUrl.trim() : "";
  /** Wikidata P18 often returns http:// Commons URLs; store as https for thread display. */
  const rawImgHttps =
    rawImg.length > 0 && /^http:\/\//i.test(rawImg) ? `https://${rawImg.slice(7)}` : rawImg;
  const mainImageUrl =
    rawImgHttps.length > 0 && /^https:\/\//i.test(rawImgHttps)
      ? sanitizeForDb(rawImgHttps, 2000)
      : null;
  const rawCatalog = typeof body.catalogUrl === "string" ? body.catalogUrl.trim() : "";
  const catalogUrl =
    rawCatalog.length > 0 && /^https:\/\//i.test(rawCatalog) ? sanitizeForDb(rawCatalog, 2000) : null;

  const deferReplies = Boolean(body.deferReplies);
  const artSource = normalizeArtSource(body.artSource);
  const artEx = sanitizeForDb(typeof body.artExternalId === "string" ? body.artExternalId : "", MAX_ART_EXTERNAL_ID_LEN);
  const isArt = Boolean(artSource && artEx);

  if (deferReplies && (!isArt || !artSource)) {
    return jsonResponse({ error: "Deferred save requires art source and id" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const groqApiKey = Deno.env.get("GROQ_API_KEY");
  if (!supabaseUrl || !supabaseServiceKey || !groqApiKey) {
    return jsonResponse({ error: "Server configuration error" }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const mainPostForDb = sanitizeForDb(rawTweet, 1000);

  if (isArt && artSource) {
    const topicArt = await getOrCreateTopic(supabase, userId, "Art");
    if (!topicArt) {
      return jsonResponse({ error: "Failed to create topic" }, 500);
    }

    const { data: existing } = await supabase
      .from("threads")
      .select("id, expand_pending")
      .eq("topic_id", topicArt.id)
      .eq("art_source", artSource)
      .eq("art_external_id", artEx)
      .maybeSingle();

    if (existing) {
      if (deferReplies) {
        log(FN, "info", "idempotent art save", { threadId: existing.id });
        return jsonResponse({ threadId: existing.id });
      }
      if (existing.expand_pending) {
        const result = await generateAndPersistReplies(supabase, groqApiKey, {
          threadId: existing.id,
          tweet,
          logFn: FN,
        });
        if (!result.ok) {
          return jsonResponse({ error: result.error }, result.status);
        }
        log(FN, "info", "expanded deferred art", { threadId: existing.id });
        return jsonResponse({ threadId: existing.id });
      }
      return jsonResponse({ threadId: existing.id });
    }

    const insertRow: Record<string, unknown> = {
      topic_id: topicArt.id,
      main_post: mainPostForDb,
      replies: [],
      expand_pending: deferReplies,
      art_source: artSource,
      art_external_id: artEx,
    };
    if (mainImageUrl) insertRow.main_image_url = mainImageUrl;
    if (catalogUrl) insertRow.catalog_url = catalogUrl;

    const { data: threadRow, error: threadError } = await supabase
      .from("threads")
      .insert(insertRow)
      .select("id")
      .single();

    if (threadError || !threadRow) {
      log(FN, "error", "Thread insert error", threadError);
      return jsonResponse({ error: "Failed to create thread" }, 500);
    }

    if (deferReplies) {
      log(FN, "info", "deferred art thread", { threadId: threadRow.id });
      return jsonResponse({ threadId: threadRow.id });
    }

    const result = await generateAndPersistReplies(supabase, groqApiKey, {
      threadId: threadRow.id,
      tweet,
      logFn: FN,
    });
    if (!result.ok) {
      return jsonResponse({ error: result.error }, result.status);
    }
    log(FN, "info", "success art immediate", { threadId: threadRow.id });
    return jsonResponse({ threadId: threadRow.id });
  }

  const topicRow = await getOrCreateTopic(supabase, userId, "Home");
  if (!topicRow) {
    return jsonResponse({ error: "Failed to create topic" }, 500);
  }

  const insertRow: Record<string, unknown> = {
    topic_id: topicRow.id,
    main_post: mainPostForDb,
    replies: [],
    expand_pending: false,
  };
  if (mainImageUrl) insertRow.main_image_url = mainImageUrl;
  if (catalogUrl) insertRow.catalog_url = catalogUrl;

  const { data: threadRow, error: threadError } = await supabase
    .from("threads")
    .insert(insertRow)
    .select("id")
    .single();

  if (threadError || !threadRow) {
    log(FN, "error", "Thread insert error", threadError);
    return jsonResponse({ error: "Failed to create thread" }, 500);
  }

  const result = await generateAndPersistReplies(supabase, groqApiKey, {
    threadId: threadRow.id,
    tweet,
    logFn: FN,
  });
  if (!result.ok) {
    return jsonResponse({ error: result.error }, result.status);
  }

  log(FN, "info", "success Home thread", { threadId: threadRow.id, repliesCount: result.replyCount });
  return jsonResponse({ threadId: threadRow.id });
}

export const config: Config = {
  path: "/api/thread-from-tweet",
};
