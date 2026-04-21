import type { Artwork } from '../types/art';

/**
 * Grid tiles prefer `thumbUrl`; modal prefers `imageUrl`. When both differ, the full image
 * is not loaded until the popup — prefetch those URLs so the modal can hit cache.
 */
export function urlsNeedingFullResPrefetch(works: readonly Artwork[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of works) {
    const full = a.imageUrl;
    if (!full) continue;
    if (a.thumbUrl && a.thumbUrl !== full && !seen.has(full)) {
      seen.add(full);
      out.push(full);
    }
  }
  return out;
}

export function prefetchArtImageUrls(urls: readonly string[]): void {
  for (const url of urls) {
    const img = new Image();
    img.src = url;
  }
}

/**
 * @param maxItems — when set, only the last N works are considered (e.g. long infinite artist lists).
 */
export function prefetchArtFullResForPopup(
  works: readonly Artwork[],
  opts?: { maxItems?: number }
): void {
  const max = opts?.maxItems;
  const slice =
    max !== undefined && works.length > max ? works.slice(-max) : works;
  prefetchArtImageUrls(urlsNeedingFullResPrefetch(slice));
}
