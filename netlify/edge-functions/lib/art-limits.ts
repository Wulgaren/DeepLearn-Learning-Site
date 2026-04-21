/** Shared bounds for art edge proxies (abuse / WDQS protection). */

export const MAX_ART_SEARCH_QUERY_LEN = 200;
export const MAX_WIKIDATA_PAGE = 500;
export const MAX_ART_EXTERNAL_ID_LEN = 256;
export const MAX_ART_SEED_LEN = 128;

export function clampArtSearchQuery(q: string): string {
  return q.trim().slice(0, MAX_ART_SEARCH_QUERY_LEN);
}

export function clampWikidataPage(page: number): number {
  return Math.min(Math.max(0, Math.floor(page)), MAX_WIKIDATA_PAGE);
}

export function clampArtExternalId(id: string): string {
  return id.trim().slice(0, MAX_ART_EXTERNAL_ID_LEN);
}
