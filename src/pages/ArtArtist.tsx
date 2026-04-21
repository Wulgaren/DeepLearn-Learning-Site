import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { getArtArtistPage } from '../lib/api';
import { catalogPageUrl } from '../lib/artTweet';
import { openModalUnlessModifiedClick } from '../lib/artModal';
import { getErrorMessage } from '../lib/errors';
import { useArtRoute } from '../contexts/ArtRouteContext';
import { artistKey, threadNewHrefForArtwork, workKey } from '../lib/artRouteUtils';
import type { ArtSource, Artwork } from '../types/art';
import ArtworkDetailModal from '../components/ArtworkDetailModal';
import { truncateForTabTitle, useDocumentTitle } from '../hooks/useDocumentTitle';

function isArtSource(s: string): s is ArtSource {
  return s === 'met' || s === 'europeana' || s === 'wikidata';
}

export default function ArtArtist() {
  const params = useParams<{ source: string; externalId: string }>();
  const [searchParams] = useSearchParams();
  const labelHint = searchParams.get('label');

  const {
    user,
    saveArtMutation,
    savedArtists,
    threadIdByWork,
  } = useArtRoute();

  const [selected, setSelected] = useState<Artwork | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const source = params.source ?? '';
  const externalId = params.externalId ? decodeURIComponent(params.externalId) : '';
  const sourceValid = isArtSource(source);
  const savedArtistLookupKey =
    sourceValid && externalId ? (`${source}:${externalId}` as const) : null;

  const queryKey = useMemo(
    () => ['artArtist', source, externalId, labelHint] as const,
    [source, externalId, labelHint]
  );

  const artistQuery = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      getArtArtistPage({
        source: source as ArtSource,
        externalId,
        cursor: pageParam,
        label: labelHint,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: sourceValid && Boolean(externalId),
  });

  const items = artistQuery.data?.pages.flatMap((p) => p.items) ?? [];
  const firstMeta = artistQuery.data?.pages[0];
  const apiMessage = firstMeta?.error;
  const artistLabel = firstMeta?.artistLabel ?? labelHint ?? externalId;
  useDocumentTitle(truncateForTabTitle(artistLabel));
  const wikiUrl = firstMeta?.wikiUrl ?? null;
  const metSearchUrl = firstMeta?.metSearchUrl ?? null;

  const fetchNextPage = artistQuery.fetchNextPage;
  const hasNextPage = artistQuery.hasNextPage;
  const isFetchingNextPage = artistQuery.isFetchingNextPage;
  const isLoading = artistQuery.isLoading;
  const error = artistQuery.error;

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || !hasNextPage) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: '400px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, items.length]);

  if (!sourceValid || !externalId) {
    return (
      <div className="pb-10">
        <p className="text-zinc-500 text-sm">Invalid artist link. Use the header back button to return to Art.</p>
      </div>
    );
  }

  return (
    <div className="pb-10">
      <div className="border-b border-zinc-800/80 pb-4 mb-4 pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="m-0 text-xl font-semibold text-zinc-100">{artistLabel}</h1>
            {wikiUrl && (
              <div className="mt-2 text-sm">
                <a href={wikiUrl} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">
                  Wikidata
                </a>
              </div>
            )}
          </div>
          {metSearchUrl && (
            <a
              href={metSearchUrl}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 p-2 rounded-full text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/80 transition"
              aria-label="Met collection search"
              title="Met collection search"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                />
              </svg>
            </a>
          )}
        </div>
        {apiMessage && <p className="m-0 mt-3 text-sm text-amber-200/90">{apiMessage}</p>}
        {error && (
          <p className="m-0 mt-3 text-sm text-red-300">{getErrorMessage(error)}</p>
        )}
        {isLoading && <p className="m-0 mt-3 text-zinc-500 text-sm">Loading…</p>}
        {!isLoading && !error && items.length === 0 && !apiMessage && (
          <p className="m-0 mt-3 text-zinc-500 text-sm">No works found for this artist.</p>
        )}
      </div>

      <section className="pt-2">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {items.map((a) => {
            const thumb = a.thumbUrl ?? a.imageUrl;
            const wk = workKey(a);
            const ak = artistKey(a);
            const isSaved = Boolean(user && threadIdByWork.has(wk));
            const artistSaved = savedArtistLookupKey
              ? savedArtists.has(savedArtistLookupKey)
              : ak
                ? savedArtists.has(ak)
                : false;
            const href = user ? threadNewHrefForArtwork(a) : catalogPageUrl(a);
            return (
              <a
                key={wk}
                href={href}
                target="_blank"
                rel="noreferrer"
                tabIndex={0}
                onClick={(e) => openModalUnlessModifiedClick(e, () => setSelected(a))}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    setSelected(a);
                  }
                }}
                className="group text-left rounded-2xl border border-zinc-800 bg-zinc-950/80 overflow-hidden hover:border-zinc-600 transition focus:outline-none focus:ring-2 focus:ring-zinc-500 cursor-pointer no-underline text-inherit block"
              >
                <div className="aspect-square bg-zinc-900 relative">
                  {thumb ? (
                    <img src={thumb} alt="" className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs p-2">
                      No image
                    </div>
                  )}
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button
                      type="button"
                      className="text-[10px] px-2 py-1 rounded-full bg-black/70 text-zinc-200 disabled:opacity-40"
                      disabled={!user || saveArtMutation.isPending}
                      onClick={(ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        if (!user) return;
                        saveArtMutation.mutate({
                          a,
                          save: !isSaved,
                          existingThreadId: isSaved ? threadIdByWork.get(wk) : null,
                        });
                      }}
                      title={isSaved ? 'Remove saved thread' : 'Save as thread'}
                    >
                      {isSaved ? '★' : '☆'}
                    </button>
                  </div>
                </div>
                <div className="p-3 min-w-0">
                  <p className="m-0 text-sm font-medium text-zinc-100 line-clamp-2">{a.title}</p>
                  {a.artist?.label && (
                    <p className="m-0 mt-1 text-xs text-zinc-500 line-clamp-1">{a.artist.label}</p>
                  )}
                  <p className="m-0 mt-2 text-[10px] text-zinc-600 line-clamp-2">
                    {a.attribution ?? a.source}
                    {artistSaved ? ' · artist saved' : ''}
                  </p>
                </div>
              </a>
            );
          })}
        </div>

        <div
          ref={loadMoreRef}
          className="h-8 mt-6 flex items-center justify-center text-zinc-500 text-sm"
        >
          {isFetchingNextPage ? 'Loading more…' : ''}
        </div>
      </section>

      <ArtworkDetailModal
        selected={selected}
        onClose={() => setSelected(null)}
        savedArtistLookupKey={savedArtistLookupKey}
        canonicalArtistExternalId={sourceValid ? externalId : null}
        galleryItems={items}
        onNavigateTo={setSelected}
      />
    </div>
  );
}
