import { clampArtSearchQuery } from "./art-limits.ts";

/** Normalized artwork JSON returned by art-* edge handlers (matches client `Artwork`). */
export interface NormalizedArtwork {
  source: "met" | "europeana" | "wikidata";
  id: string;
  title: string;
  imageUrl: string | null;
  thumbUrl: string | null;
  description: string | null;
  rights: string | null;
  attribution: string | null;
  objectUrl: string | null;
  artist: {
    id: string | null;
    label: string | null;
    wikiUrl: string | null;
  } | null;
}

const MET_BASE = "https://collectionapi.metmuseum.org/public/collection/v1";

const SEARCH_TERMS = [
  "portrait",
  "landscape",
  "still life",
  "figure",
  "nature",
  "city",
  "sea",
  "flower",
  "animal",
  "saint",
  "myth",
  "battle",
  "interior",
  "woman",
  "man",
  "child",
  "dance",
  "music",
  "gold",
  "silver",
  "ivory",
];

/** Default Europeana query terms when none passed (aligned with Met-style discovery). */
export const EUROPEANA_DEFAULT_TERMS = [
  "painting",
  "portrait",
  "landscape",
  "sculpture",
  "drawing",
  "photograph",
  "miniature",
  "illuminated manuscript",
  "ceramic",
  "textile",
];

/** 32-bit FNV-1a for deterministic “random” offsets from a client seed. */
export function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export async function fetchMetPage(
  page: number,
  batchSize = 12
): Promise<{ items: NormalizedArtwork[]; nextPage: number }> {
  const deptRes = await fetch(`${MET_BASE}/departments`);
  if (!deptRes.ok) throw new Error(`Met departments ${deptRes.status}`);
  const deptJson = (await deptRes.json()) as { departments?: Array<{ departmentId: number }> };
  const departments = deptJson.departments?.map((d) => d.departmentId) ?? [];
  if (departments.length === 0) {
    return { items: [], nextPage: page + 1 };
  }

  const maxAttempts = 8;
  const collected: NormalizedArtwork[] = [];
  let attempt = 0;
  let p = page;

  while (collected.length < batchSize && attempt < maxAttempts) {
    const deptId = departments[p % departments.length];
    const term = SEARCH_TERMS[Math.floor(p / departments.length) % SEARCH_TERMS.length];
    const searchUrl = `${MET_BASE}/search?hasImages=true&q=${encodeURIComponent(term)}&departmentId=${deptId}`;
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) {
      attempt += 1;
      p += 1;
      continue;
    }
    const searchData = (await searchRes.json()) as { objectIDs?: number[]; total?: number };
    const ids = (searchData.objectIDs ?? []).slice(0, batchSize);
    for (const objectID of ids) {
      if (collected.length >= batchSize) break;
      try {
        const objRes = await fetch(`${MET_BASE}/objects/${objectID}`);
        if (!objRes.ok) continue;
        const o = (await objRes.json()) as Record<string, unknown>;
        const mapped = mapMetObject(o);
        if (mapped.imageUrl || mapped.thumbUrl) {
          collected.push(mapped);
        }
      } catch {
        /* skip */
      }
    }
    attempt += 1;
    p += 1;
  }

  return { items: collected, nextPage: p };
}

export function mapMetObject(o: Record<string, unknown>): NormalizedArtwork {
  const objectID = o.objectID;
  const id = objectID != null ? String(objectID) : "unknown";
  const constituents = o.constituents as Array<{ constituentID?: number; name?: string }> | undefined;
  const first = constituents?.[0];
  const artistDisplay = typeof o.artistDisplayName === "string" ? o.artistDisplayName : null;
  const primaryImage = typeof o.primaryImage === "string" ? o.primaryImage : null;
  const primaryImageSmall = typeof o.primaryImageSmall === "string" ? o.primaryImageSmall : null;
  const title = typeof o.title === "string" && o.title.length > 0 ? o.title : "Untitled";
  const department = typeof o.department === "string" ? o.department : "";
  const objectDate = typeof o.objectDate === "string" ? o.objectDate : "";
  const medium = typeof o.medium === "string" ? o.medium : "";
  const creditLine = typeof o.creditLine === "string" ? o.creditLine : "";
  const objectURL = typeof o.objectURL === "string" ? o.objectURL : null;
  const descParts = [department, objectDate, medium].filter(Boolean).join(" · ");
  return {
    source: "met",
    id,
    title,
    imageUrl: primaryImage,
    thumbUrl: primaryImageSmall ?? primaryImage,
    description: descParts || null,
    rights: "The Met Open Access (CC0) for many images; verify on object page.",
    attribution: creditLine ? `The Metropolitan Museum of Art. ${creditLine}` : "The Metropolitan Museum of Art",
    objectUrl: objectURL,
    artist:
      first?.constituentID != null || artistDisplay || first?.name
        ? {
            id: first?.constituentID != null ? String(first.constituentID) : null,
            label: artistDisplay ?? first?.name ?? null,
            wikiUrl: null,
          }
        : null,
  };
}

export async function fetchEuropeanaPage(
  cursor: string | null,
  query: string,
  rows = 12
): Promise<{ items: NormalizedArtwork[]; nextCursor: string | null }> {
  const wskey = Deno.env.get("EUROPEANA_API_KEY");
  if (!wskey) {
    throw new Error("EUROPEANA_API_KEY not configured");
  }
  const q = clampArtSearchQuery(query) || "painting";
  let url = `https://api.europeana.eu/record/v2/search.json?wskey=${encodeURIComponent(wskey)}&query=${encodeURIComponent(
    q
  )}&media=true&rows=${rows}&profile=rich`;
  if (cursor) {
    url += `&cursor=${encodeURIComponent(cursor)}`;
  }
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
  if (data.success === false) {
    throw new Error("Europeana search returned success=false");
  }
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

function firstString(val: unknown): string | null {
  if (typeof val === "string") return val;
  if (Array.isArray(val) && val.length > 0 && typeof val[0] === "string") return val[0];
  return null;
}

export function mapEuropeanaItem(it: Record<string, unknown>, _index: number): NormalizedArtwork {
  const idRaw = typeof it.id === "string" ? it.id : `/item/${_index}`;
  const id = idRaw.replace(/^\/+/, "").replace(/\//g, "_") || String(_index);
  const title =
    firstString(it.title) ?? firstString(it.dcTitle) ?? firstString(it.dcDescription) ?? "Untitled";
  const preview =
    firstString(it.edmPreview) ??
    firstString((it as { edmIsShownBy?: string[] }).edmIsShownBy) ??
    firstString((it as { edmObject?: string[] }).edmObject);
  const creator =
    firstString(it.dcCreator) ??
    firstString((it as { dcCreatorLangAware?: { def?: string[] } }).dcCreatorLangAware?.def?.[0]);
  const dataProvider = firstString((it as { dataProvider?: string[] }).dataProvider);
  const rights = firstString(it.rights) ?? "See record for rights.";
  const dcDesc =
    firstString(it.dcDescription) ??
    firstString((it as { dcDescriptionLangAware?: { def?: string[] } }).dcDescriptionLangAware?.def?.[0]);
  const guid =
    typeof it.guid === "string"
      ? it.guid
      : typeof it.id === "string"
        ? `https://www.europeana.eu/item${it.id}`
        : "https://www.europeana.eu";
  return {
    source: "europeana",
    id,
    title,
    imageUrl: preview,
    thumbUrl: preview,
    description: dcDesc ?? null,
    rights,
    attribution: dataProvider ? `Europeana — ${dataProvider}` : "Europeana",
    objectUrl: guid,
    artist: creator ? { id: null, label: creator, wikiUrl: null } : null,
  };
}

export function commonsPathToUrl(fileName: string): string {
  const trimmed = fileName.replace(/^File:/i, "");
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(trimmed)}`;
}

export async function fetchWikidataPage(
  page: number,
  limit = 12
): Promise<{ items: NormalizedArtwork[]; nextPage: number }> {
  const offset = page * limit;
  // WDQS perf: `SERVICE wikibase:label` and un-scoped joins over P18×P31 explode work *before* LIMIT.
  // Pattern: inner subquery returns only LIMIT rows (?item, ?image); outer adds labels on ≤12 items.
  // Use wikibase:label with language fallback — plain rdfs:label + LANG=en misses items with no English label
  // (they became "Work Q…" before). Still direct `wdt:P31` only (no P279*). Extend VALUES ?class if needed.
  const query = `
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX bd: <http://www.bigdata.com/rdf#>
SELECT ?item ?itemLabel ?image ?creator ?creatorLabel WHERE {
  {
    SELECT ?item ?image WHERE {
      VALUES ?class { wd:Q3305213 wd:Q128115 wd:Q125191 }
      ?item wdt:P31 ?class .
      ?item wdt:P18 ?image .
    }
    LIMIT ${limit}
    OFFSET ${offset}
  }
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "en,de,fr,es,it,pt,ru,ja,zh,mul".
  }
  OPTIONAL { ?item wdt:P170 ?creator . }
}
`.trim();

  const res = await fetch("https://query.wikidata.org/sparql", {
    method: "POST",
    headers: {
      Accept: "application/sparql-results+json",
      "Content-Type": "application/x-www-form-urlencoded",
      // https://wikidata.wikidata.org/wiki/Wikidata:Data_access — identify the client
      "User-Agent": "DeepLearn/1.0 (https://github.com/; art-wikidata edge)",
    },
    body: new URLSearchParams({ query }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Wikidata SPARQL ${res.status}: ${t.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    results?: { bindings?: Array<Record<string, { value?: string; type?: string }>> };
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
    const qid = itemUri.match(/entity\/(Q\d+)/)?.[1] ?? itemUri;
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
      b.itemLabel?.value?.trim() ||
      (qid.startsWith("Q") ? `Untitled (${qid})` : "Untitled");
    const creatorLabel = b.creatorLabel?.value ?? null;
    return {
      source: "wikidata" as const,
      id: qid,
      title: label,
      imageUrl: imgUrl,
      thumbUrl: imgUrl,
      description: null,
      rights: null,
      attribution: null,
      objectUrl: qid.startsWith("Q") ? `https://www.wikidata.org/wiki/${qid}` : null,
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
  return { items, nextPage: page + 1 };
}
