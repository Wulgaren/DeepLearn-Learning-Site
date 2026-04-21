import type { Config, Context } from "@netlify/edge-functions";
import type { NormalizedArtwork } from "./lib/art-shared.ts";
import {
  EUROPEANA_DEFAULT_TERMS,
  fetchEuropeanaPage,
  fetchMetPage,
  fetchWikidataPage,
  hashSeed,
} from "./lib/art-shared.ts";
import { decodeArtCursorJson, encodeArtCursorJson } from "./lib/art-cursor.ts";
import { clampArtSearchQuery, MAX_ART_SEED_LEN } from "./lib/art-limits.ts";
import { corsHeaders, getUserId, jsonResponse, log } from "./lib/shared.ts";

const FN = "art-combined";

/** Items fetched per source per combined page (interleaved → ~3× this many cards, capped). */
const SLICE = 4;
const MAX_OUT = 36;

type CursorState = {
  metPage: number;
  wdPage: number;
  europeanaCursor: string | null;
  europeanaQ: string;
  europeanaSkip?: boolean;
};

function decodeCursor(raw: string): CursorState | null {
  const o = decodeArtCursorJson(raw);
  if (!o || typeof o !== "object" || o === null) return null;
  const rec = o as Record<string, unknown>;
  if (typeof rec.metPage !== "number" || typeof rec.wdPage !== "number") return null;
  const europeanaQ =
    typeof rec.europeanaQ === "string" ? clampArtSearchQuery(rec.europeanaQ) || "painting" : "painting";
  const europeanaCursor =
    rec.europeanaCursor === null || typeof rec.europeanaCursor === "string" ? rec.europeanaCursor : null;
  return {
    metPage: rec.metPage,
    wdPage: rec.wdPage,
    europeanaCursor,
    europeanaQ,
    europeanaSkip: rec.europeanaSkip === true,
  };
}

function initialCursor(seed: string, qParam: string | null): CursorState {
  const euQ =
    qParam && qParam.trim().length > 0
      ? clampArtSearchQuery(qParam) || "painting"
      : EUROPEANA_DEFAULT_TERMS[hashSeed(seed + ":e") % EUROPEANA_DEFAULT_TERMS.length]!;
  return {
    metPage: hashSeed(seed + ":m") % 900,
    wdPage: hashSeed(seed + ":w") % 600,
    europeanaCursor: null,
    europeanaQ: euQ,
  };
}

function interleave(met: NormalizedArtwork[], eu: NormalizedArtwork[], wd: NormalizedArtwork[]): NormalizedArtwork[] {
  const out: NormalizedArtwork[] = [];
  const n = Math.max(met.length, eu.length, wd.length);
  for (let i = 0; i < n && out.length < MAX_OUT; i++) {
    if (met[i]) out.push(met[i]!);
    if (eu[i]) out.push(eu[i]!);
    if (wd[i]) out.push(wd[i]!);
  }
  return out;
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

  const url = new URL(req.url);
  const seed = (url.searchParams.get("seed") ?? "default").slice(0, MAX_ART_SEED_LEN);
  const qParam = url.searchParams.get("q");
  const cursorRaw = url.searchParams.get("cursor");

  let state: CursorState;
  if (cursorRaw) {
    const decoded = decodeCursor(cursorRaw);
    if (!decoded) {
      return jsonResponse({ error: "Invalid cursor" }, 400);
    }
    state = decoded;
    const qClamped = qParam ? clampArtSearchQuery(qParam) : "";
    if (qClamped && qClamped !== state.europeanaQ) {
      state.europeanaQ = qClamped;
      state.europeanaCursor = null;
      state.europeanaSkip = false;
    }
  } else {
    state = initialCursor(seed, qParam);
  }

  const euSkipIn = state.europeanaSkip === true;

  try {
    const [met, wd, euWrap] = await Promise.all([
      fetchMetPage(state.metPage, SLICE),
      fetchWikidataPage(state.wdPage, SLICE),
      (async (): Promise<{ items: NormalizedArtwork[]; nextCursor: string | null; skip: boolean }> => {
        if (euSkipIn) return { items: [], nextCursor: null, skip: true };
        try {
          const eu = await fetchEuropeanaPage(state.europeanaCursor, state.europeanaQ, SLICE);
          return { items: eu.items, nextCursor: eu.nextCursor, skip: false };
        } catch (err) {
          log(FN, "warn", "Europeana skipped", { error: err instanceof Error ? err.message : String(err) });
          return { items: [], nextCursor: null, skip: true };
        }
      })(),
    ]);

    const euItems = euWrap.items;
    const euNext = euWrap.nextCursor;
    const euSkip = euSkipIn || euWrap.skip;

    const items = interleave(met.items, euItems, wd.items);

    const nextState: CursorState = {
      metPage: met.nextPage,
      wdPage: wd.nextPage,
      europeanaCursor: euNext,
      europeanaQ: state.europeanaQ,
      europeanaSkip: euSkip,
    };

    const nextCursor = items.length > 0 ? encodeArtCursorJson(nextState) : null;

    log(FN, "info", "ok", {
      count: items.length,
      metNext: met.nextPage,
      wdNext: wd.nextPage,
      euSkip,
    });

    return jsonResponse({ items, nextCursor });
  } catch (err) {
    log(FN, "error", "Met or Wikidata failed", { error: err instanceof Error ? err.message : String(err) });
    return jsonResponse({ error: "Failed to load art sources" }, 502);
  }
}

export const config: Config = {
  path: "/api/art-combined",
};
