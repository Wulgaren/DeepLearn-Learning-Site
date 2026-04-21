const MAX_LABEL = 48;

/**
 * Short label for thread rows: prefer text in "quotes" or 'quotes', else a run of
 * Title Case words (e.g. proper names), else "Thread".
 */
export function threadDisplayLabelFromPost(mainPost: string): string {
  const text = mainPost.trim();
  if (!text) return 'Thread';

  const fromQuote = extractFirstQuoted(text);
  if (fromQuote) {
    const t = trimLabel(fromQuote);
    if (t !== 'Thread') return t;
  }

  const titleRun = extractConsecutiveTitleCaseWords(text);
  if (titleRun) {
    const t = trimLabel(titleRun);
    if (t !== 'Thread') return t;
  }

  return 'Thread';
}

function extractFirstQuoted(text: string): string | null {
  const d = text.match(/"([^"]{2,200})"/);
  if (d?.[1]) return d[1].trim();

  const curly = text.match(/[\u201c]([^\u201d]{2,200})[\u201d]/);
  if (curly?.[1]) return curly[1].trim();

  const s = text.match(/'([^']{2,200})'/);
  if (s?.[1]) return s[1].trim();

  return null;
}

/** Two or more consecutive words like `John Smith` or `The Metropolitan Museum`. */
function extractConsecutiveTitleCaseWords(text: string): string | null {
  const m = text.match(/\b(?:[A-Z][a-z]+\s+){1,4}[A-Z][a-z]+\b/);
  if (m?.[0]) return m[0].trim();
  return null;
}

function trimLabel(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length === 0) return 'Thread';
  if (t.length <= MAX_LABEL) return t;
  return `${t.slice(0, MAX_LABEL - 1).trimEnd()}…`;
}
