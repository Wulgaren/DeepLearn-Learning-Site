import type { Artwork } from '../types/art';

const MAX_LEN = 950;

/** Strip bare http(s) URLs so catalog lives on the thread “Open in catalog” action. */
function stripHttpUrls(s: string): string {
  return s
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^\s*:\s*/g, '')
    .trim();
}

/** Stable catalog URL for an artwork (object page); used for “Open in catalog” and thread metadata. */
export function catalogPageUrl(a: Artwork): string {
  const u = a.objectUrl?.trim();
  if (u) return u;
  if (a.source === 'met' && /^\d+$/.test(a.id)) {
    return `https://www.metmuseum.org/art/collection/object/${a.id}`;
  }
  if (a.source === 'wikidata' && /^Q\d+/.test(a.id)) {
    return `https://www.wikidata.org/wiki/${a.id}`;
  }
  const q = encodeURIComponent((a.title || 'artwork').slice(0, 120));
  return `https://www.europeana.eu/en/search?query=${q}`;
}

/** Plain-text “main post” for thread-from-tweet (server truncates / sanitizes further). */
export function artworkToMainTweet(artwork: Artwork): string {
  const lines: string[] = [];
  lines.push(artwork.title?.trim() || 'Untitled');
  if (artwork.artist?.label?.trim()) {
    lines.push(`Artist: ${artwork.artist.label.trim()}`);
  }
  const titleT = artwork.title?.trim() ?? '';
  const desc = artwork.description?.trim();
  const attr = artwork.attribution?.trim();
  if (desc && desc !== titleT) {
    const redundant = attr && (attr.includes(desc) || desc === attr);
    if (!redundant) {
      lines.push(desc);
    }
  }
  if (attr) {
    lines.push(attr);
  }
  if (artwork.rights?.trim()) {
    const rightsClean = stripHttpUrls(artwork.rights.trim());
    if (rightsClean.length > 0) {
      lines.push(`Rights: ${rightsClean}`);
    }
  }
  let text = lines.join('\n\n');
  if (text.length > MAX_LEN) {
    text = `${text.slice(0, MAX_LEN - 1)}…`;
  }
  return text;
}
