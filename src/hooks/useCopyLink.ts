import { useState, useCallback } from 'react';
import { getThreadUrl } from '../lib/urls';

const COPIED_DURATION_MS = 2000;

export function useCopyLink(): { copyLink: (threadId: string) => Promise<void>; linkCopied: boolean } {
  const [linkCopied, setLinkCopied] = useState(false);

  const copyLink = useCallback(async (threadId: string) => {
    const url = getThreadUrl(threadId);
    await navigator.clipboard.writeText(url);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), COPIED_DURATION_MS);
  }, []);

  return { copyLink, linkCopied };
}
