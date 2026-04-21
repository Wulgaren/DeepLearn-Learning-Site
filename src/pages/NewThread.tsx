import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createThreadFromTweet } from '../lib/api';
import type { ArtSource } from '../types/art';
import { getErrorMessage } from '../lib/errors';
import { normalizeHttpsImageUrl } from '../lib/artRouteUtils';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

type ThreadNewState = {
  tweet?: string;
  mainImageUrl?: string | null;
  catalogUrl?: string | null;
  artSource?: ArtSource;
  artExternalId?: string;
};

/**
 * Creates a thread from navigation state or URL hash, then redirects to the thread.
 * - Hash: /thread/new#<encodeURIComponent(tweet)> (Home, shareable)
 * - Query: ?img=&catalog=&artSource=&artId= (Art: open in new tab; pairs with hash)
 * - State: ... + artSource, artExternalId for deduped Art-topic threads
 */
export default function NewThread() {
  useDocumentTitle('New thread');
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const createMutation = useMutation({
    mutationFn: createThreadFromTweet,
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['homeThreads'] });
      queryClient.invalidateQueries({ queryKey: ['artThreads'] });
      const fromArt = Boolean(variables.artSource && variables.artExternalId);
      navigate(`/thread/${data.threadId}`, {
        replace: true,
        state: fromArt ? { from: '/art' } : undefined,
      });
    },
    onError: (err) => {
      setError(getErrorMessage(err));
    },
  });

  useEffect(() => {
    if (started.current) return;

    const st = location.state as ThreadNewState | null;
    const params = new URLSearchParams(location.search);
    const imgFromQuery = params.get('img')?.trim();
    const catalogFromQuery = params.get('catalog')?.trim();
    const artSrcQ = params.get('artSource')?.trim();
    const artIdQ = params.get('artId')?.trim();
    const validArt =
      artSrcQ === 'met' || artSrcQ === 'europeana' || artSrcQ === 'wikidata';

    let tweet: string | undefined;
    let mainImageUrl: string | null | undefined;
    let catalogUrl: string | null | undefined;
    let artSource: ArtSource | undefined;
    let artExternalId: string | undefined;

    if (st?.tweet?.trim()) {
      tweet = st.tweet.trim();
      mainImageUrl = normalizeHttpsImageUrl(st.mainImageUrl ?? null) ?? undefined;
      catalogUrl = st.catalogUrl ?? undefined;
      artSource = st.artSource;
      artExternalId = st.artExternalId?.trim() || undefined;
    } else {
      const rawHash = location.hash.slice(1);
      if (!rawHash) {
        queueMicrotask(() => setError('Missing suggestion'));
        return;
      }
      try {
        tweet = decodeURIComponent(rawHash);
      } catch {
        queueMicrotask(() => setError('Invalid link'));
        return;
      }
      mainImageUrl = normalizeHttpsImageUrl(imgFromQuery) ?? undefined;
      catalogUrl =
        catalogFromQuery && /^https:\/\//i.test(catalogFromQuery)
          ? catalogFromQuery
          : undefined;
      if (validArt && artIdQ) {
        artSource = artSrcQ as ArtSource;
        artExternalId = artIdQ;
      }
    }

    if (!tweet?.trim()) {
      queueMicrotask(() => setError('Missing suggestion'));
      return;
    }

    started.current = true;
    createMutation.mutate({
      tweet: tweet.trim(),
      mainImageUrl,
      catalogUrl,
      ...(artSource && artExternalId
        ? { artSource, artExternalId }
        : {}),
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- run once; location captured on mount

  if (error || createMutation.isError) {
    return (
      <div className="py-10 text-center">
        <p className="text-red-400 text-sm">{error ?? getErrorMessage(createMutation.error)}</p>
        <button
          type="button"
          onClick={() => navigate('/', { replace: true })}
          className="mt-4 px-4 py-2 rounded-full font-semibold bg-zinc-100 text-black hover:bg-white"
        >
          Back to Home
        </button>
      </div>
    );
  }

  return (
    <div className="py-10 text-center">
      <p className="text-zinc-400 text-sm">Creating thread…</p>
    </div>
  );
}
