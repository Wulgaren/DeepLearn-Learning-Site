const STORAGE_KEY_LAST_Q = 'deeplearn:artLastQ';

/** Single-word Europeana-style terms; varied enough to change feed feel. */
const RANDOM_WORDS = [
  'painting',
  'portrait',
  'landscape',
  'sculpture',
  'drawing',
  'watercolor',
  'still life',
  'miniature',
  'tapestry',
  'engraving',
  'cathedral',
  'garden',
  'fresco',
  'mask',
  'vessel',
  'armor',
  'costume',
  'manuscript',
  'ceramic',
  'furniture',
  'photograph',
] as const;

export function pickRandomArtWord(): string {
  const i = Math.floor(Math.random() * RANDOM_WORDS.length);
  return RANDOM_WORDS[i] ?? 'painting';
}

/**
 * URL `q` wins. On `/art` with no `q`, use last stored term or a new random word.
 * Other art routes (e.g. artist) keep `'painting'` when unset.
 * When `q` is present, persist it for “return to /art without query” behavior.
 */
export function resolveArtFeedQ(pathname: string, searchParams: URLSearchParams): string {
  const raw = searchParams.get('q')?.trim();
  if (raw) {
    try {
      sessionStorage.setItem(STORAGE_KEY_LAST_Q, raw);
    } catch {
      /* ignore */
    }
    return raw;
  }
  if (pathname !== '/art') return 'painting';
  try {
    let v = sessionStorage.getItem(STORAGE_KEY_LAST_Q);
    if (!v) {
      v = pickRandomArtWord();
      sessionStorage.setItem(STORAGE_KEY_LAST_Q, v);
    }
    return v;
  } catch {
    return pickRandomArtWord();
  }
}

/** Shuffle / picker: new random term + persist for bare `/art` revisits. */
export function stashArtFeedQ(q: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY_LAST_Q, q);
  } catch {
    /* ignore */
  }
}
