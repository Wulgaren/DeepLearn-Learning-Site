import { useEffect, useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { getArtEuropeanaPage, getArtMetPage, getArtWikidataPage } from '../lib/api';
import { getArtFeedInitialParams } from '../lib/artFeedInitialParams';
import { catalogPageUrl } from '../lib/artTweet';
import { openModalUnlessModifiedClick } from '../lib/artModal';
import { getErrorMessage } from '../lib/errors';
import { useArtRoute } from '../contexts/ArtRouteContext';
import { prefetchArtFullResForPopup } from '../lib/artPrefetchFullRes';
import { artistKey, threadNewHrefForArtwork, workKey } from '../lib/artRouteUtils';
import type { Artwork } from '../types/art';
import ArtRightRail from '../components/ArtRightRail';
import ArtworkDetailModal from '../components/ArtworkDetailModal';

const feedGc = {
  staleTime: Infinity,
  gcTime: 1000 * 60 * 60 * 24,
  refetchOnWindowFocus: false,
};

type SourceKey = 'met' | 'europeana' | 'wikidata';

export default function Art() {
  useDocumentTitle('Art');
  const {
    user,
    qApplied,
    feedSeed,
    saveArtMutation,
    savedArtists,
    threadIdByWork,
  } = useArtRoute();

  const [selected, setSelected] = useState<Artwork | null>(null);

  const initialParams = useMemo(
    () => getArtFeedInitialParams(feedSeed, qApplied),
    [feedSeed, qApplied]
  );

  const [arrivalAt, setArrivalAt] = useState<Partial<Record<SourceKey, number>>>({});

  useEffect(() => {
    setArrivalAt({});
  }, [feedSeed, qApplied]);

  const [metQ, euQ, wdQ] = useQueries({
    queries: [
      {
        queryKey: ['artFeed', 'met', feedSeed, qApplied],
        queryFn: () => getArtMetPage(initialParams.metPage),
        ...feedGc,
      },
      {
        queryKey: ['artFeed', 'europeana', feedSeed, qApplied],
        queryFn: () => getArtEuropeanaPage(null, initialParams.europeanaQ),
        ...feedGc,
      },
      {
        queryKey: ['artFeed', 'wikidata', feedSeed, qApplied],
        queryFn: () => getArtWikidataPage(initialParams.wdPage),
        ...feedGc,
      },
    ],
  });

  useEffect(() => {
    if (metQ.isSuccess && metQ.data) {
      setArrivalAt((a) => (a.met !== undefined ? a : { ...a, met: performance.now() }));
    }
  }, [metQ.isSuccess, metQ.data]);

  useEffect(() => {
    if (euQ.isSuccess && euQ.data) {
      setArrivalAt((a) =>
        a.europeana !== undefined ? a : { ...a, europeana: performance.now() }
      );
    }
  }, [euQ.isSuccess, euQ.data]);

  useEffect(() => {
    if (wdQ.isSuccess && wdQ.data) {
      setArrivalAt((a) => (a.wikidata !== undefined ? a : { ...a, wikidata: performance.now() }));
    }
  }, [wdQ.isSuccess, wdQ.data]);

  const feedItems = useMemo(() => {
    const parts: { t: number; items: Artwork[] }[] = [];
    if (arrivalAt.met !== undefined && metQ.data?.items) {
      parts.push({ t: arrivalAt.met, items: metQ.data.items });
    }
    if (arrivalAt.europeana !== undefined && euQ.data?.items) {
      parts.push({ t: arrivalAt.europeana, items: euQ.data.items });
    }
    if (arrivalAt.wikidata !== undefined && wdQ.data?.items) {
      parts.push({ t: arrivalAt.wikidata, items: wdQ.data.items });
    }
    parts.sort((x, y) => x.t - y.t);
    return parts.flatMap((p) => p.items);
  }, [arrivalAt, metQ.data, euQ.data, wdQ.data]);

  const items = feedItems;

  useEffect(() => {
    if (!feedItems.length) return;
    prefetchArtFullResForPopup(feedItems);
  }, [feedItems]);

  const allDone = !metQ.isPending && !euQ.isPending && !wdQ.isPending;
  const blockingError =
    allDone && items.length === 0 && metQ.isError && euQ.isError && wdQ.isError;
  const showSkeleton =
    !blockingError && items.length === 0 && (metQ.isPending || euQ.isPending || wdQ.isPending);
  const euMissingKey =
    !blockingError &&
    euQ.isError &&
    String(getErrorMessage(euQ.error)).toLowerCase().includes('not configured');

  return (
    <div className="pb-10">
      <div className="lg:hidden mb-6">
        <ArtRightRail compactRail />
      </div>

      {blockingError && (
        <div className="rounded-xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-200 mb-4">
          {getErrorMessage(metQ.error ?? euQ.error ?? wdQ.error)}
          {String(getErrorMessage(metQ.error ?? euQ.error ?? wdQ.error)).includes('not configured') && (
            <span> Add EUROPEANA_API_KEY to Netlify env (see README).</span>
          )}
        </div>
      )}

      {!blockingError && euMissingKey && (
        <div className="rounded-xl border border-amber-900/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-100/90 mb-4">
          Europeana unavailable (not configured). Met and Wikidata still load.
          <span className="text-amber-200/80"> Add EUROPEANA_API_KEY to Netlify env (see README).</span>
        </div>
      )}

      {!blockingError && !showSkeleton && items.length === 0 && allDone && (
        <p className="text-zinc-500 text-sm mb-4">No items returned. Try Shuffle or another search.</p>
      )}

      {(showSkeleton || items.length > 0) && (
      <section className="pt-4" aria-busy={showSkeleton}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {showSkeleton &&
            Array.from({ length: 6 }, (_, i) => (
              <div
                key={`sk-${i}`}
                className="rounded-2xl border border-zinc-800/80 bg-zinc-950/60 overflow-hidden animate-pulse"
                aria-hidden
              >
                <div className="aspect-square bg-zinc-800/70" />
                <div className="p-3 space-y-2">
                  <div className="h-4 bg-zinc-800/80 rounded w-[85%]" />
                  <div className="h-3 bg-zinc-800/60 rounded w-[55%]" />
                  <div className="h-3 bg-zinc-800/50 rounded w-full" />
                </div>
              </div>
            ))}
          {!showSkeleton &&
            items.map((a) => {
            const thumb = a.thumbUrl ?? a.imageUrl;
            const wk = workKey(a);
            const ak = artistKey(a);
            const isSaved = Boolean(user && threadIdByWork.has(wk));
            const artistSaved = ak ? savedArtists.has(ak) : false;
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
      </section>
      )}

      <ArtworkDetailModal
        selected={selected}
        onClose={() => setSelected(null)}
        galleryItems={items}
        onNavigateTo={setSelected}
      />
    </div>
  );
}
