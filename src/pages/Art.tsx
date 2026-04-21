import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getArtCombinedPage } from '../lib/api';
import { catalogPageUrl } from '../lib/artTweet';
import { openModalUnlessModifiedClick } from '../lib/artModal';
import { getErrorMessage } from '../lib/errors';
import { useArtRoute } from '../contexts/ArtRouteContext';
import { artistKey, threadNewHrefForArtwork, workKey } from '../lib/artRouteUtils';
import type { Artwork } from '../types/art';
import ArtRightRail from '../components/ArtRightRail';
import ArtworkDetailModal from '../components/ArtworkDetailModal';

export default function Art() {
  const {
    user,
    qApplied,
    feedSeed,
    saveArtMutation,
    savedArtists,
    threadIdByWork,
  } = useArtRoute();

  const [selected, setSelected] = useState<Artwork | null>(null);

  const feedQuery = useQuery({
    queryKey: ['artFeed', 'combined', feedSeed, qApplied],
    queryFn: () =>
      getArtCombinedPage({
        seed: feedSeed,
        cursor: null,
        q: qApplied,
      }),
  });

  const items = feedQuery.data?.items ?? [];
  const isLoading = feedQuery.isLoading;
  const isFetching = feedQuery.isFetching;
  const error = feedQuery.error;

  return (
    <div className="pb-10">
      <div className="lg:hidden mb-6">
        <ArtRightRail />
      </div>

      <section className="border-b border-zinc-800/80 pb-4">
        {error && (
          <div className="rounded-xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-200 mb-4">
            {getErrorMessage(error)}
            {String(getErrorMessage(error)).includes('not configured') && (
              <span> Add EUROPEANA_API_KEY to Netlify env (see README).</span>
            )}
          </div>
        )}

        {(isLoading || isFetching) && <p className="text-zinc-500 text-sm py-2">Loading…</p>}

        {!isLoading && !isFetching && !error && items.length === 0 && (
          <p className="text-zinc-500 text-sm">No items returned. Try Shuffle or another search.</p>
        )}
      </section>

      <section className="pt-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {items.map((a) => {
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

      <ArtworkDetailModal selected={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
