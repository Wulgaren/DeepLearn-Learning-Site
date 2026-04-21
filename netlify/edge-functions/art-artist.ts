import type { Config, Context } from "@netlify/edge-functions";
import type { NormalizedArtwork } from "./lib/art-shared.ts";
import {
  commonsPathToUrl,
  mapEuropeanaItem,
  mapMetObject,
} from "./lib/art-shared.ts";
import { corsHeaders, jsonResponse, log } from "./lib/shared.ts";

const FN = "art-artist";
const MET_BASE = "https://collectionapi.metmuseum.org/public/collection/v1";
const BATCH = 12;

type CursorState = { wdOffset?: number; metOffset?: number; euCursor?: string | null };

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
    return {
      wdOffset: typeof o.wdOffset === "number" ? o.wdOffset : 0,
      metOffset: typeof o.metOffset === "number" ? o.metOffset : 0,
      euCursor: o.euCursor === null || typeof o.euCursor === "string" ? o.euCursor : null,
    };
  } catch {
    return null;
  }
}

async function wikidataEntityLabel(qid: string): Promise<string | null> {
  const u = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(
    qid
  )}&format=json&props=labels&languages=en`;
  const res = await fetch(u, {
    headers: { "User-Agent": "DeepLearn/1.0 (art-artist edge)" },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    entities?: Record<string, { labels?: { en?: { value?: string } } }>;
  };
  const ent = data.entities?.[qid];
  return ent?.labels?.en?.value ?? null;
}

async function fetchWikidataByArtist(
  qid: string,
  offset: number
): Promise<{ items: NormalizedArtwork[]; nextOffset: number }> {
  const query = `
SELECT ?item ?itemLabel ?image ?creator ?creatorLabel WHERE {
  {
    SELECT ?item ?image WHERE {
      VALUES ?artist { wd:${qid} }
      VALUES ?class { wd:Q3305213 wd:Q128115 wd:Q125191 }
      ?item wdt:P31 ?class .
      ?item wdt:P170 ?artist .
      ?item wdt:P18 ?image .
    }
    LIMIT ${BATCH}
    OFFSET ${offset}
  }
  OPTIONAL {
    ?item rdfs:label ?itemLabel .
    FILTER((LANG(?itemLabel)) = "en")
  }
  OPTIONAL { ?item wdt:P170 ?creator . }
  OPTIONAL {
    ?creator rdfs:label ?creatorLabel .
    FILTER((LANG(?creatorLabel)) = "en")
  }
}
`.trim();

  const res = await fetch("https://query.wikidata.org/sparql", {
    method: "POST",
    headers: {
      Accept: "application/sparql-results+json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "DeepLearn/1.0 (https://github.com/; art-artist edge)",
    },
    body: new URLSearchParams({ query }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Wikidata SPARQL ${res.status}: ${t.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    results?: { bindings?: Array<Record<string, { value?: string }>> };
  };
  const bindingsRaw = json.results?.bindings ?? [];
  const bindings: typeof bindingsRaw = [];
  const seenItems = new Set<string>();
  for (const b of bindingsRaw) {
    const uri = b.item?.value;
    if (!uri || seenItems.has(uri)) continue;
    seenItems.add(uri);
    bindings.push(b);
  }

  const items: NormalizedArtwork[] = bindings.map((b) => {
    const itemUri = b.item?.value ?? "";
    const qidItem = itemUri.match(/entity\/(Q\d+)/)?.[1] ?? itemUri;
    const imageUri = b.image?.value ?? "";
    let imgUrl: string | null = null;
    if (imageUri.startsWith("http://") || imageUri.startsWith("https://")) {
      imgUrl = imageUri.startsWith("http://") ? `https://${imageUri.slice(7)}` : imageUri;
    } else if (imageUri) {
      const fileName = imageUri.includes("Special:FilePath/")
        ? decodeURIComponent(imageUri.split("Special:FilePath/")[1] ?? "")
        : imageUri.split("/").pop() ?? "";
      imgUrl = fileName ? commonsPathToUrl(fileName) : null;
    }
    const creatorUri = b.creator?.value ?? "";
    const creatorId = creatorUri.match(/entity\/(Q\d+)/)?.[1] ?? null;
    const label =
      b.itemLabel?.value?.trim() || (qidItem.startsWith("Q") ? `Work ${qidItem}` : "Untitled");
    const creatorLabel = b.creatorLabel?.value ?? null;
    return {
      source: "wikidata" as const,
      id: qidItem,
      title: label,
      imageUrl: imgUrl,
      thumbUrl: imgUrl,
      description: "Data from Wikidata / Wikimedia Commons; verify license on file page.",
      rights: "Wikimedia Commons — check file page for license.",
      attribution: "Wikidata / Wikimedia Commons",
      objectUrl: qidItem.startsWith("Q") ? `https://www.wikidata.org/wiki/${qidItem}` : null,
      artist:
        creatorLabel || creatorId
          ? {
              id: creatorId,
              label: creatorLabel,
              wikiUrl: creatorId ? `https://www.wikidata.org/wiki/${creatorId}` : null,
            }
          : null,
    };
  });

  return { items, nextOffset: offset + items.length };
}

async function metSearchObjectIds(
  name: string,
  mode: "general" | "artistField" | "anyImage"
): Promise<number[]> {
  const params = new URLSearchParams();
  params.set("q", name);
  if (mode !== "anyImage") params.set("hasImages", "true");
  if (mode === "artistField") params.set("artistOrCulture", "true");
  const searchUrl = `${MET_BASE}/search?${params.toString()}`;
  const searchRes = await fetch(searchUrl);
  if (!searchRes.ok) {
    throw new Error(`Met search ${searchRes.status}`);
  }
  const searchData = (await searchRes.json()) as { objectIDs?: number[] };
  return searchData.objectIDs ?? [];
}

/**
 * Website collection search is broad full-text; `artistOrCulture=true` only matches artist/culture
 * fields and often returns 0 for names like "Utagawa Kunisada" while /search?q=… does not.
 * Prefer general q + hasImages first; fall back to artistOrCulture if needed.
 */
async function fetchMetByArtistName(
  name: string,
  offset: number
): Promise<{ items: NormalizedArtwork[]; nextOffset: number; totalIds: number }> {
  let ids = await metSearchObjectIds(name, "general");
  if (ids.length === 0) ids = await metSearchObjectIds(name, "artistField");
  if (ids.length === 0) ids = await metSearchObjectIds(name, "anyImage");
  const totalIds = ids.length;
  const slice = ids.slice(offset, offset + BATCH);
  const collected: NormalizedArtwork[] = [];
  for (const objectID of slice) {
    try {
      const objRes = await fetch(`${MET_BASE}/objects/${objectID}`);
      if (!objRes.ok) continue;
      const o = (await objRes.json()) as Record<string, unknown>;
      const mapped = mapMetObject(o);
      /** Include works without open-access images so the grid matches Met search hit counts. */
      collected.push(mapped);
    } catch {
      /* skip */
    }
  }
  return { items: collected, nextOffset: offset + slice.length, totalIds };
}

async function fetchEuropeanaByCreator(
  name: string,
  cursor: string | null
): Promise<{ items: NormalizedArtwork[]; nextCursor: string | null }> {
  const wskey = Deno.env.get("EUROPEANA_API_KEY");
  if (!wskey) {
    throw new Error("EUROPEANA_API_KEY not configured");
  }
  const safe = name.replace(/"/g, "").trim() || "painting";
  const queryStr = `who:"${safe}"`;
  let url = `https://api.europeana.eu/record/v2/search.json?wskey=${encodeURIComponent(
    wskey
  )}&query=${encodeURIComponent(queryStr)}&media=true&rows=${BATCH}&profile=rich`;
  if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Europeana ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    items?: Array<Record<string, unknown>>;
    nextCursor?: string;
    next?: string;
    success?: boolean;
  };
  if (data.success === false) throw new Error("Europeana search returned success=false");
  const items = data.items ?? [];
  const mapped: NormalizedArtwork[] = items.map((it, i) => mapEuropeanaItem(it, i));
  const nextCursor =
    typeof data.nextCursor === "string" && data.nextCursor.length > 0
      ? data.nextCursor
      : typeof data.next === "string" && data.next.length > 0
        ? data.next
        : null;
  return { items: mapped, nextCursor };
}

export default async function handler(req: Request, _context: Context): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const url = new URL(req.url);
  const source = url.searchParams.get("source") as "met" | "europeana" | "wikidata" | null;
  const externalId = url.searchParams.get("externalId")?.trim() ?? "";
  const labelHint = url.searchParams.get("label")?.trim() ?? null;
  const cursorRaw = url.searchParams.get("cursor");

  if (!source || !["met", "europeana", "wikidata"].includes(source)) {
    return jsonResponse({ error: "Invalid or missing source" }, 400);
  }
  if (!externalId) {
    return jsonResponse({ error: "Missing externalId" }, 400);
  }

  let state: CursorState = { wdOffset: 0, metOffset: 0, euCursor: null };
  if (cursorRaw) {
    const d = decodeCursor(cursorRaw);
    if (!d) return jsonResponse({ error: "Invalid cursor" }, 400);
    state = d;
  }

  try {
    if (source === "wikidata") {
      const qid = externalId.match(/^(Q\d+)$/)?.[1];
      if (!qid) {
        return jsonResponse(
          {
            items: [],
            nextCursor: null,
            artistLabel: labelHint,
            wikiUrl: null,
            metSearchUrl: null,
            error: "Wikidata artist view needs a Q-ID (e.g. Q5582).",
          },
          200
        );
      }
      const [artistLabel, wd] = await Promise.all([
        wikidataEntityLabel(qid),
        fetchWikidataByArtist(qid, state.wdOffset ?? 0),
      ]);
      const hasMore = wd.items.length === BATCH;
      const nextState: CursorState = {
        wdOffset: wd.nextOffset,
        metOffset: 0,
        euCursor: null,
      };
      const nextCursor = hasMore ? encodeCursor(nextState) : null;
      log(FN, "info", "wikidata ok", { n: wd.items.length, qid });
      return jsonResponse({
        items: wd.items,
        nextCursor,
        artistLabel: artistLabel ?? labelHint ?? qid,
        wikiUrl: `https://www.wikidata.org/wiki/${qid}`,
        metSearchUrl: null,
      });
    }

    if (source === "met") {
      const name =
        labelHint ||
        (externalId.startsWith("label:") ? externalId.slice("label:".length) : null) ||
        externalId;
      const { items, nextOffset, totalIds } = await fetchMetByArtistName(name, state.metOffset ?? 0);
      const hasMore = nextOffset < totalIds && items.length > 0;
      const nextState: CursorState = {
        wdOffset: 0,
        metOffset: nextOffset,
        euCursor: null,
      };
      const nextCursor = hasMore ? encodeCursor(nextState) : null;
      const metSearchUrl = `https://www.metmuseum.org/art/collection/search?q=${encodeURIComponent(
        name
      )}`;
      log(FN, "info", "met ok", { n: items.length, name });
      return jsonResponse({
        items,
        nextCursor,
        artistLabel: name,
        wikiUrl: null,
        metSearchUrl,
      });
    }

    // europeana
    const name =
      labelHint ||
      (externalId.startsWith("label:") ? externalId.slice("label:".length) : externalId);
    const eu = await fetchEuropeanaByCreator(name, state.euCursor ?? null);
    const nextState: CursorState = {
      wdOffset: 0,
      metOffset: 0,
      euCursor: eu.nextCursor,
    };
    const nextCursor = eu.nextCursor ? encodeCursor(nextState) : null;
    log(FN, "info", "europeana ok", { n: eu.items.length, name });
    return jsonResponse({
      items: eu.items,
      nextCursor,
      artistLabel: name,
      wikiUrl: null,
      metSearchUrl: null,
    });
  } catch (err) {
    log(FN, "error", "failed", { error: err instanceof Error ? err.message : String(err) });
    return jsonResponse({ error: "Failed to load artist works" }, 502);
  }
}

export const config: Config = {
  path: "/api/art-artist",
};
