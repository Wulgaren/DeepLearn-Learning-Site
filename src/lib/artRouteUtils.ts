import { artworkToMainTweet, catalogPageUrl } from './artTweet';
import type { Artwork } from '../types/art';

/**
 * Wikidata P18 / Commons often returns http:// URLs; thread API and UI require https for main_image.
 */
export function normalizeHttpsImageUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  let u = url.trim();
  if (/^http:\/\//i.test(u)) u = `https://${u.slice(7)}`;
  return /^https:\/\//i.test(u) ? u : null;
}

export function workKey(a: Artwork): string {
  return `${a.source}:${a.id}`;
}

/** Stable id for `saved_artists.external_id` — must match server upsert/delete. */
export function artistExternalId(a: Artwork): string | null {
  if (!a.artist) return null;
  return a.artist.id ?? (a.artist.label ? `label:${a.artist.label}` : null);
}

export function artistKey(a: Artwork): string | null {
  const ext = artistExternalId(a);
  return ext ? `${a.source}:${ext}` : null;
}

/** In-app artist gallery: `/art/artist/:source/:externalId` with optional `?label=`. */
export function artistViewHref(
  source: string,
  externalId: string,
  label: string | null | undefined
): string {
  const path = `/art/artist/${encodeURIComponent(source)}/${encodeURIComponent(externalId)}`;
  const lab = label?.trim();
  return lab ? `${path}?label=${encodeURIComponent(lab)}` : path;
}

/** Same route shape as saved-artist links in the rail; `null` if no stable artist id. */
export function inAppArtistHref(a: Artwork): string | null {
  const ext = artistExternalId(a);
  if (!ext) return null;
  return artistViewHref(a.source, ext, a.artist?.label ?? null);
}

export function threadNewHrefForArtwork(a: Artwork): string {
  const tweet = artworkToMainTweet(a);
  const safeImage = normalizeHttpsImageUrl(a.imageUrl ?? a.thumbUrl ?? null);
  const catalogUrl = catalogPageUrl(a);
  const qs = new URLSearchParams();
  if (safeImage) qs.set('img', safeImage);
  if (catalogUrl) qs.set('catalog', catalogUrl);
  qs.set('artSource', a.source);
  qs.set('artId', a.id);
  const qstr = qs.toString();
  return `/thread/new?${qstr}#${encodeURIComponent(tweet)}`;
}
