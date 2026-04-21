/** Mirrors `NormalizedArtwork` from edge `lib/art-shared.ts`. */
export type ArtSource = 'met' | 'europeana' | 'wikidata';

export interface ArtworkArtist {
  id: string | null;
  label: string | null;
  wikiUrl: string | null;
}

export interface Artwork {
  source: ArtSource;
  id: string;
  title: string;
  imageUrl: string | null;
  thumbUrl: string | null;
  description: string | null;
  rights: string | null;
  attribution: string | null;
  objectUrl: string | null;
  artist: ArtworkArtist | null;
}

export interface ArtMetPageResponse {
  items: Artwork[];
  nextPage: number;
}

export interface ArtEuropeanaPageResponse {
  items: Artwork[];
  nextCursor: string | null;
}

export interface ArtWikidataPageResponse {
  items: Artwork[];
  nextPage: number;
}

export interface ArtCombinedPageResponse {
  items: Artwork[];
  nextCursor: string | null;
}

export interface ArtArtistPageResponse {
  items: Artwork[];
  nextCursor: string | null;
  artistLabel: string | null;
  wikiUrl: string | null;
  metSearchUrl: string | null;
  error?: string;
}
