import { useLayoutEffect } from 'react';

const APP = 'DeepLearn';
const SUFFIX = ` – ${APP}`;

/** Collapse whitespace; cap length for tab strip. */
export function truncateForTabTitle(text: string, maxLen = 70): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(0, maxLen - 1))}…`;
}

/** Sets `document.title` for current route; restores default app name when title empty. */
export function useDocumentTitle(pageTitle: string) {
  useLayoutEffect(() => {
    const base = pageTitle.trim();
    document.title = base ? `${base}${SUFFIX}` : APP;
    return () => {
      document.title = APP;
    };
  }, [pageTitle]);
}
