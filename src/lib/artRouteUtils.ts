import { artworkToMainTweet, catalogPageUrl } from './artTweet';
import type { Artwork } from '../types/art';

export function workKey(a: Artwork): string {
  return `${a.source}:${a.id}`;
}

export function artistKey(a: Artwork): string | null {
  if (!a.artist) return null;
  const ext = a.artist.id ?? (a.artist.label ? `label:${a.artist.label}` : null);
  return ext ? `${a.source}:${ext}` : null;
}

export function metArtistUrl(a: Artwork): string | null {
  const label = a.artist?.label?.trim();
  if (!label) return null;
  return `https://www.metmuseum.org/art/collection/search?q=${encodeURIComponent(label)}`;
}

export function threadNewHrefForArtwork(a: Artwork): string {
  const tweet = artworkToMainTweet(a);
  const mainImageUrl = a.imageUrl ?? a.thumbUrl ?? null;
  const safeImage =
    mainImageUrl && /^https:\/\//i.test(mainImageUrl) ? mainImageUrl : null;
  const catalogUrl = catalogPageUrl(a);
  const qs = new URLSearchParams();
  if (safeImage) qs.set('img', safeImage);
  if (catalogUrl) qs.set('catalog', catalogUrl);
  qs.set('artSource', a.source);
  qs.set('artId', a.id);
  const qstr = qs.toString();
  return `/thread/new?${qstr}#${encodeURIComponent(tweet)}`;
}
