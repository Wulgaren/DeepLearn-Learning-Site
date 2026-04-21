import type { Config, Context } from "@netlify/edge-functions";
import type { NormalizedArtwork } from "./lib/art-shared.ts";
import {
  EUROPEANA_DEFAULT_TERMS,
  fetchEuropeanaPage,
  fetchMetPage,
  fetchWikidataPage,
  hashSeed,
} from "./lib/art-shared.ts";
import { corsHeaders, jsonResponse, log } from "./lib/shared.ts";

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

function encodeCursor(c: CursorState): string {
  const bytes = new TextEncoder().encode(JSON.stringify(c));
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeCursor(raw: string): CursorState | null {
  try {
    const pad = raw.length % 4 === 0 ? "" : "=".repeat(4 - (raw.length % 4));
    const b64 = raw.replace(/-/g, "+").replace(/_/g, "/") + pad;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const json = new TextDecoder().decode(bytes);
    const o = JSON.parse(json) as Record<string, unknown>;
    if (typeof o.metPage !== "number" || typeof o.wdPage !== "number") return null;
    const europeanaQ = typeof o.europeanaQ === "string" ? o.europeanaQ : "painting";
    const europeanaCursor =
      o.europeanaCursor === null || typeof o.europeanaCursor === "string" ? o.europeanaCursor : null;
    return {
      metPage: o.metPage,
      wdPage: o.wdPage,
      europeanaCursor,
      europeanaQ,
      europeanaSkip: o.europeanaSkip === true,
    };
  } catch {
    return null;
  }
}

function initialCursor(seed: string, qParam: string | null): CursorState {
  const euQ =
    qParam && qParam.trim().length > 0
      ? qParam.trim()
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

  const url = new URL(req.url);
  const seed = (url.searchParams.get("seed") ?? "default").slice(0, 128);
  const qParam = url.searchParams.get("q");
  const cursorRaw = url.searchParams.get("cursor");

  let state: CursorState;
  if (cursorRaw) {
    const decoded = decodeCursor(cursorRaw);
    if (!decoded) {
      return jsonResponse({ error: "Invalid cursor" }, 400);
    }
    state = decoded;
    if (qParam && qParam.trim() && qParam.trim() !== state.europeanaQ) {
      state.europeanaQ = qParam.trim();
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

    const nextCursor = items.length > 0 ? encodeCursor(nextState) : null;

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
