/**
 * Mirrors `initialCursor` in `netlify/edge-functions/art-combined.ts`
 * so separate art-* fetches use the same Met / Wikidata / Europeana entry points.
 * Keep in sync if that handler changes seed math.
 */

export const EUROPEANA_DEFAULT_TERMS = [
  'painting',
  'portrait',
  'landscape',
  'sculpture',
  'drawing',
  'photograph',
  'miniature',
  'illuminated manuscript',
  'ceramic',
  'textile',
] as const;

const MAX_WIKIDATA_PAGE = 500;
const MAX_ART_SEARCH_QUERY_LEN = 200;
const MAX_ART_SEED_LEN = 128;

/** Same 32-bit FNV-1a as `netlify/edge-functions/lib/art-shared.ts`. */
export function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function clampNonNegInt(n: number, max: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(0, Math.floor(n)), max);
}

function clampWikidataPage(page: number): number {
  return clampNonNegInt(page, MAX_WIKIDATA_PAGE);
}

/** Same cap as `clampArtCombinedMetPage` (Met list index). */
const MAX_ART_COMBINED_MET_PAGE = 10_000;

function clampArtCombinedMetPage(page: number): number {
  return clampNonNegInt(page, MAX_ART_COMBINED_MET_PAGE);
}

function clampArtSearchQuery(q: string): string {
  return q.trim().slice(0, MAX_ART_SEARCH_QUERY_LEN);
}

export function getArtFeedInitialParams(
  seed: string,
  q: string
): { metPage: number; wdPage: number; europeanaQ: string } {
  const s = seed.slice(0, MAX_ART_SEED_LEN);
  const euQ =
    q.trim().length > 0
      ? clampArtSearchQuery(q) || 'painting'
      : EUROPEANA_DEFAULT_TERMS[hashSeed(`${s}:e`) % EUROPEANA_DEFAULT_TERMS.length]!;
  return {
    metPage: clampArtCombinedMetPage(hashSeed(`${s}:m`) % 900),
    wdPage: clampWikidataPage(hashSeed(`${s}:w`) % (MAX_WIKIDATA_PAGE + 1)),
    europeanaQ: euQ,
  };
}
