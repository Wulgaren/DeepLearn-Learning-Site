/** Shared bounds for art edge proxies (abuse / WDQS protection). */

export const MAX_ART_SEARCH_QUERY_LEN = 200;
export const MAX_WIKIDATA_PAGE = 500;
/** Upper bound for Met rotation index in combined feed (`fetchMetPage`); blocks runaway cursor values. */
export const MAX_ART_COMBINED_MET_PAGE = 10_000;
/**
 * Max SPARQL OFFSET for artist-by-entity Wikidata queries (same scale as `MAX_WIKIDATA_PAGE` × typical batch).
 */
export const MAX_WIKIDATA_ARTIST_SPARQL_OFFSET = MAX_WIKIDATA_PAGE * 12;
/** Max offset into Met `/search` object ID list for artist pagination. */
export const MAX_MET_ARTIST_OBJECT_OFFSET = 100_000;
/** Bound Europeana cursor length when supplied via client-controlled cursor JSON. */
export const MAX_ART_EUROPEANA_CURSOR_LEN = 8192;
export const MAX_ART_EXTERNAL_ID_LEN = 256;
export const MAX_ART_SEED_LEN = 128;

export function clampArtSearchQuery(q: string): string {
  return q.trim().slice(0, MAX_ART_SEARCH_QUERY_LEN);
}

function clampNonNegInt(n: number, max: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(0, Math.floor(n)), max);
}

export function clampWikidataPage(page: number): number {
  return clampNonNegInt(page, MAX_WIKIDATA_PAGE);
}

export function clampArtCombinedMetPage(page: number): number {
  return clampNonNegInt(page, MAX_ART_COMBINED_MET_PAGE);
}

export function clampWikidataArtistSparqlOffset(offset: number): number {
  return clampNonNegInt(offset, MAX_WIKIDATA_ARTIST_SPARQL_OFFSET);
}

export function clampMetArtistObjectOffset(offset: number): number {
  return clampNonNegInt(offset, MAX_MET_ARTIST_OBJECT_OFFSET);
}

export function clampEuropeanaCursorParam(c: string | null): string | null {
  if (c == null) return null;
  if (c.length <= MAX_ART_EUROPEANA_CURSOR_LEN) return c;
  return c.slice(0, MAX_ART_EUROPEANA_CURSOR_LEN);
}

export function clampArtExternalId(id: string): string {
  return id.trim().slice(0, MAX_ART_EXTERNAL_ID_LEN);
}
