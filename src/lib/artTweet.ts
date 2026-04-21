import type { Artwork } from '../types/art';

const MAX_LEN = 950;

/** Plain-text “main post” for thread-from-tweet (server truncates / sanitizes further). */
export function artworkToMainTweet(artwork: Artwork): string {
  const lines: string[] = [];
  lines.push(artwork.title?.trim() || 'Untitled');
  if (artwork.artist?.label?.trim()) {
    lines.push(`Artist: ${artwork.artist.label.trim()}`);
  }
  if (artwork.description?.trim()) {
    lines.push(artwork.description.trim());
  }
  if (artwork.attribution?.trim()) {
    lines.push(artwork.attribution.trim());
  }
  if (artwork.rights?.trim()) {
    lines.push(`Rights: ${artwork.rights.trim()}`);
  }
  if (artwork.objectUrl?.trim()) {
    lines.push(artwork.objectUrl.trim());
  }
  let text = lines.join('\n\n');
  if (text.length > MAX_LEN) {
    text = `${text.slice(0, MAX_LEN - 1)}…`;
  }
  return text;
}
