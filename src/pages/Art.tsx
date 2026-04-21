import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getArtCombinedPage, createThreadFromTweet, getArtThreads } from '../lib/api';
import { artworkToMainTweet, catalogPageUrl } from '../lib/artTweet';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { getErrorMessage } from '../lib/errors';
import { formatThreadDate } from '../lib/format';
import type { Artwork } from '../types/art';
import type { ArtThreadSummary } from '../types';

function workKey(a: Artwork): string {
  return `${a.source}:${a.id}`;
}

function artistKey(a: Artwork): string | null {
  if (!a.artist) return null;
  const ext = a.artist.id ?? (a.artist.label ? `label:${a.artist.label}` : null);
  return ext ? `${a.source}:${ext}` : null;
}

function metArtistUrl(a: Artwork): string | null {
  const label = a.artist?.label?.trim();
  if (!label) return null;
  return `https://www.metmuseum.org/art/collection/search?q=${encodeURIComponent(label)}`;
}

function openModalUnlessModifiedClick(
  e: React.MouseEvent<HTMLAnchorElement>,
  open: () => void
): void {
  if (e.defaultPrevented) return;
  if (e.button !== 0) return;
  if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  open();
}

function ArtSidebar(props: {
  europeanaQ: string;
  setEuropeanaQ: (s: string) => void;
  onSearchSubmit: (e: React.FormEvent) => void;
  savedRowsArtists: { source: string; external_id: string; label: string | null }[];
  artThreads: ArtThreadSummary[];
  onShuffle: () => void;
}) {
  const { europeanaQ, setEuropeanaQ, onSearchSubmit, savedRowsArtists, artThreads, onShuffle } = props;
  return (
    <div className="space-y-4">
      <form onSubmit={onSearchSubmit} className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3">
        <label className="block text-xs text-zinc-500 mb-1">Europeana search</label>
        <div className="flex gap-2 flex-wrap">
          <input
            type="search"
            value={europeanaQ}
            onChange={(e) => setEuropeanaQ(e.target.value)}
            placeholder="e.g. painting, photo"
            className="flex-1 min-w-[120px] rounded-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-600"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-full bg-zinc-100 text-black text-sm font-semibold hover:bg-white"
          >
            Search
          </button>
        </div>
        <button
          type="button"
          className="mt-3 w-full px-3 py-2 rounded-full border border-zinc-700 text-sm text-zinc-300 hover:bg-zinc-900"
          onClick={onShuffle}
        >
          Shuffle feed
        </button>
      </form>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3">
        <h3 className="m-0 text-sm font-semibold">Saved artwork threads</h3>
        {artThreads.length === 0 ? (
          <p className="m-0 mt-2 text-sm text-zinc-500">Star a work to save a thread (AI when you open it).</p>
        ) : (
          <ul className="mt-2 space-y-2 list-none p-0 m-0 max-h-[min(50vh,320px)] overflow-y-auto">
            {artThreads.map((t) => (
              <li key={t.id}>
                <Link
                  to={`/thread/${t.id}`}
                  className="block rounded-lg px-2 py-2 hover:bg-zinc-900/80 no-underline text-inherit"
                >
                  <p className="m-0 text-sm text-zinc-200 line-clamp-2">{t.main_post}</p>
                  <p className="m-0 mt-1 text-[10px] text-zinc-500">
                    {t.expand_pending ? 'Pending · ' : ''}
                    {formatThreadDate(t.created_at)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3">
        <h3 className="m-0 text-sm font-semibold">Saved artists</h3>
        {savedRowsArtists.length === 0 ? (
          <p className="m-0 mt-2 text-sm text-zinc-500">Save an artist from the detail modal.</p>
        ) : (
          <ul className="mt-2 space-y-1.5 list-none p-0 m-0 text-sm text-zinc-300">
            {savedRowsArtists.map((r) => (
              <li key={`${r.source}:${r.external_id}`} className="truncate">
                {r.label ?? `${r.source} · ${r.external_id}`}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function Art() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const qApplied = searchParams.get('q')?.trim() || 'painting';
  const [europeanaQ, setEuropeanaQ] = useState(qApplied);

  useEffect(() => {
    setEuropeanaQ(searchParams.get('q')?.trim() || 'painting');
  }, [searchParams]);

  const [sessionSeed] = useState(() => crypto.randomUUID());
  const [shuffleKey, setShuffleKey] = useState(0);
  const feedSeed = `${sessionSeed}:${shuffleKey}`;
  const [selected, setSelected] = useState<Artwork | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const { data: artThreadsData } = useQuery({
    queryKey: ['artThreads', user?.id],
    queryFn: getArtThreads,
    enabled: !!user,
  });

  const threadIdByWork = useMemo(() => {
    const list = artThreadsData?.threads ?? [];
    const m = new Map<string, string>();
    for (const t of list) {
      if (t.art_source && t.art_external_id) {
        m.set(`${t.art_source}:${t.art_external_id}`, t.id);
      }
    }
    return m;
  }, [artThreadsData?.threads]);

  const { data: savedArtistsRows } = useQuery({
    queryKey: ['savedArtists', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('saved_artists').select('source, external_id, label');
      if (error) throw error;
      return data ?? [];
    },
  });

  const savedArtists = useMemo(
    () => new Set((savedArtistsRows ?? []).map((r) => `${r.source}:${r.external_id}`)),
    [savedArtistsRows]
  );

  const saveArtMutation = useMutation({
    mutationFn: async ({
      a,
      save,
      existingThreadId,
    }: {
      a: Artwork;
      save: boolean;
      existingThreadId?: string | null;
    }) => {
      if (!user) throw new Error('Sign in required');
      if (save) {
        await createThreadFromTweet({
          tweet: artworkToMainTweet(a),
          mainImageUrl:
            a.imageUrl && /^https:\/\//i.test(a.imageUrl)
              ? a.imageUrl
              : a.thumbUrl && /^https:\/\//i.test(a.thumbUrl)
                ? a.thumbUrl
                : null,
          catalogUrl: catalogPageUrl(a),
          deferReplies: true,
          artSource: a.source,
          artExternalId: a.id,
        });
      } else {
        const id = existingThreadId ?? null;
        if (!id) return;
        const { error } = await supabase.from('threads').delete().eq('id', id);
        if (error) throw error;
      }
    },
    onError: (e) => {
      console.error(e);
      alert(getErrorMessage(e));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artThreads'] });
    },
  });

  const combinedQuery = useInfiniteQuery({
    queryKey: ['artFeed', 'combined', feedSeed, qApplied],
    queryFn: ({ pageParam }) =>
      getArtCombinedPage({
        seed: feedSeed,
        cursor: pageParam,
        q: qApplied,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const items = combinedQuery.data?.pages.flatMap((p) => p.items) ?? [];
  const fetchNextPage = combinedQuery.fetchNextPage;
  const hasNextPage = combinedQuery.hasNextPage;
  const isFetchingNextPage = combinedQuery.isFetchingNextPage;
  const isLoading = combinedQuery.isLoading;
  const error = combinedQuery.error;

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

  const toggleSaveArtist = useCallback(
    async (a: Artwork) => {
      if (!user) return;
      const ak = artistKey(a);
      if (!ak) {
        alert('No artist metadata for this item.');
        return;
      }
      const ext = a.artist?.id ?? (a.artist?.label ? `label:${a.artist.label}` : null);
      if (!ext) return;
      try {
        if (savedArtists.has(ak)) {
          const { error: err } = await supabase
            .from('saved_artists')
            .delete()
            .eq('user_id', user.id)
            .eq('source', a.source)
            .eq('external_id', ext);
          if (err) throw err;
        } else {
          const { error: err } = await supabase.from('saved_artists').upsert(
            {
              user_id: user.id,
              source: a.source,
              external_id: ext,
              label: a.artist?.label ?? null,
              snapshot: (a.artist ?? null) as unknown as Record<string, unknown> | null,
            },
            { onConflict: 'user_id,source,external_id' }
          );
          if (err) throw err;
        }
        await queryClient.invalidateQueries({ queryKey: ['savedArtists', user.id] });
      } catch (e) {
        console.error(e);
        alert(getErrorMessage(e));
      }
    },
    [queryClient, savedArtists, user]
  );

  function applySearch(e: React.FormEvent) {
    e.preventDefault();
    const next = new URLSearchParams(searchParams);
    next.set('q', europeanaQ.trim() || 'painting');
    setSearchParams(next);
  }

  function learnMore(a: Artwork) {
    if (!user) return;
    const tweet = artworkToMainTweet(a);
    const mainImageUrl = a.imageUrl ?? a.thumbUrl ?? null;
    const safeImage =
      mainImageUrl && /^https:\/\//i.test(mainImageUrl) ? mainImageUrl : null;
    const catalogUrl = catalogPageUrl(a);
    navigate('/thread/new', {
      state: {
        tweet,
        mainImageUrl: safeImage,
        catalogUrl,
        artSource: a.source,
        artExternalId: a.id,
      },
    });
  }

  function threadNewHrefForArtwork(a: Artwork): string {
    const tweet = artworkToMainTweet(a);
    const mainImageUrl = a.imageUrl ?? a.thumbUrl ?? null;
    const safeImage =
      mainImageUrl && /^https:\/\//i.test(mainImageUrl) ? mainImageUrl : null;
    const catalogUrl = catalogPageUrl(a);
    const qs = new URLSearchParams();
    if (safeImage) qs.set('img', safeImage);
    if (catalogUrl) qs.set('catalog', catalogUrl);
    qs.set('artSource', a.source);
    qs.set('artId', a.id);
    const qstr = qs.toString();
    return `/thread/new?${qstr}#${encodeURIComponent(tweet)}`;
  }

  const sidebar = (
    <ArtSidebar
      europeanaQ={europeanaQ}
      setEuropeanaQ={setEuropeanaQ}
      onSearchSubmit={applySearch}
      savedRowsArtists={(savedArtistsRows ?? []) as { source: string; external_id: string; label: string | null }[]}
      artThreads={artThreadsData?.threads ?? []}
      onShuffle={() => setShuffleKey((k) => k + 1)}
    />
  );

  return (
    <div className="py-4 lg:py-6 max-w-6xl mx-auto">
      <div className="lg:hidden mb-6">{sidebar}</div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-8 lg:items-start">
        <div className="min-w-0">
          {error && (
            <div className="rounded-xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-200 mb-4">
              {getErrorMessage(error)}
              {String(getErrorMessage(error)).includes('not configured') && (
                <span> Add EUROPEANA_API_KEY to Netlify env (see README).</span>
              )}
            </div>
          )}

          {isLoading && <p className="text-zinc-500">Loading…</p>}

          {!isLoading && !error && items.length === 0 && (
            <p className="text-zinc-500">No items returned. Try Shuffle or another search.</p>
          )}

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

          <div
            ref={loadMoreRef}
            className="h-8 mt-6 flex items-center justify-center text-zinc-500 text-sm"
          >
            {isFetchingNextPage ? 'Loading more…' : hasNextPage ? '' : items.length > 0 ? 'End' : ''}
          </div>
        </div>

        <aside className="hidden lg:block min-w-0">{sidebar}</aside>
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal
          aria-labelledby="art-detail-title"
          onClick={() => setSelected(null)}
        >
          <div
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-zinc-800 flex justify-between items-start gap-2">
              <h2 id="art-detail-title" className="m-0 text-lg font-semibold pr-8">
                {selected.title}
              </h2>
              <button
                type="button"
                className="shrink-0 text-zinc-400 hover:text-white"
                aria-label="Close"
                onClick={() => setSelected(null)}
              >
                ×
              </button>
            </div>
            <div className="p-4 space-y-3">
              {(selected.imageUrl || selected.thumbUrl) && (
                <img
                  src={selected.imageUrl ?? selected.thumbUrl ?? ''}
                  alt=""
                  className="w-full rounded-xl border border-zinc-800"
                />
              )}
              {selected.description && <p className="m-0 text-sm text-zinc-300">{selected.description}</p>}
              <p className="m-0 text-xs text-zinc-500">{selected.rights}</p>
              <p className="m-0 text-xs text-zinc-500">{selected.attribution}</p>
              {selected.objectUrl && (
                <a
                  href={selected.objectUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-sm text-sky-400 hover:underline"
                >
                  Open in catalog
                </a>
              )}
              {selected.artist?.label && (
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-sm text-zinc-400">Artist:</span>
                  {selected.artist.wikiUrl ? (
                    <a
                      href={selected.artist.wikiUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-sky-400 hover:underline"
                    >
                      {selected.artist.label}
                    </a>
                  ) : selected.source === 'met' && metArtistUrl(selected) ? (
                    <a
                      href={metArtistUrl(selected)!}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-sky-400 hover:underline"
                    >
                      {selected.artist.label} (Met search)
                    </a>
                  ) : (
                    <span className="text-sm text-zinc-200">{selected.artist.label}</span>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  className="px-4 py-2 rounded-full bg-zinc-100 text-black text-sm font-semibold hover:bg-white disabled:opacity-50"
                  disabled={!user || saveArtMutation.isPending}
                  onClick={() =>
                    saveArtMutation.mutate({
                      a: selected,
                      save: !threadIdByWork.has(workKey(selected)),
                      existingThreadId: threadIdByWork.get(workKey(selected)),
                    })
                  }
                >
                  {threadIdByWork.has(workKey(selected)) ? 'Saved as thread' : 'Save as thread'}
                </button>
                <button
                  type="button"
                  className="px-4 py-2 rounded-full border border-zinc-700 text-sm hover:bg-zinc-900 disabled:opacity-50"
                  disabled={!user || !artistKey(selected)}
                  onClick={() => void toggleSaveArtist(selected)}
                >
                  {artistKey(selected) && savedArtists.has(artistKey(selected)!) ? 'Artist saved' : 'Save artist'}
                </button>
                <button
                  type="button"
                  className="px-4 py-2 rounded-full border border-zinc-700 text-sm hover:bg-zinc-900 disabled:opacity-50"
                  disabled={!user}
                  onClick={() => learnMore(selected)}
                >
                  Learn more
                </button>
              </div>
              {!user && (
                <p className="m-0 text-xs text-amber-200/90">Sign in to save threads and use Learn more.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
