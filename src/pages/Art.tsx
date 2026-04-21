import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  askAboutArtwork,
  getArtEuropeanaPage,
  getArtMetPage,
  getArtWikidataPage,
} from '../lib/api';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { getErrorMessage } from '../lib/errors';
import type { ArtSource, Artwork } from '../types/art';

type Tab = ArtSource;

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

export default function Art() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('met');
  const [europeanaQ, setEuropeanaQ] = useState('painting');
  const [europeanaApplied, setEuropeanaApplied] = useState('painting');
  const [selected, setSelected] = useState<Artwork | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [askQuestion, setAskQuestion] = useState('');
  const [askAnswer, setAskAnswer] = useState<string | null>(null);
  const [askLoading, setAskLoading] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const { data: savedRows } = useQuery({
    queryKey: ['savedArtworks', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('saved_artworks').select('source, external_id');
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: savedArtistsRows } = useQuery({
    queryKey: ['savedArtists', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('saved_artists').select('source, external_id');
      if (error) throw error;
      return data ?? [];
    },
  });

  const savedWorks = useMemo(
    () => new Set((savedRows ?? []).map((r) => `${r.source}:${r.external_id}`)),
    [savedRows]
  );
  const savedArtists = useMemo(
    () => new Set((savedArtistsRows ?? []).map((r) => `${r.source}:${r.external_id}`)),
    [savedArtistsRows]
  );

  const metQuery = useInfiniteQuery({
    queryKey: ['artFeed', 'met'],
    queryFn: ({ pageParam }) => getArtMetPage(pageParam),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextPage,
    enabled: tab === 'met',
  });

  const europeanaQuery = useInfiniteQuery({
    queryKey: ['artFeed', 'europeana', europeanaApplied],
    queryFn: ({ pageParam }) => getArtEuropeanaPage(pageParam, europeanaApplied),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: tab === 'europeana',
  });

  const wikidataQuery = useInfiniteQuery({
    queryKey: ['artFeed', 'wikidata'],
    queryFn: ({ pageParam }) => getArtWikidataPage(pageParam),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextPage,
    enabled: tab === 'wikidata',
  });

  const activeQuery = tab === 'met' ? metQuery : tab === 'europeana' ? europeanaQuery : wikidataQuery;

  const items =
    tab === 'met'
      ? metQuery.data?.pages.flatMap((p) => p.items) ?? []
      : tab === 'europeana'
        ? europeanaQuery.data?.pages.flatMap((p) => p.items) ?? []
        : wikidataQuery.data?.pages.flatMap((p) => p.items) ?? [];

  const fetchNextPage = activeQuery.fetchNextPage;
  const hasNextPage = activeQuery.hasNextPage;
  const isFetchingNextPage = activeQuery.isFetchingNextPage;
  const isLoading = activeQuery.isLoading;
  const error = activeQuery.error;

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

  const toggleSaveWork = useCallback(
    async (a: Artwork) => {
      if (!user) return;
      const key = workKey(a);
      try {
        if (savedWorks.has(key)) {
          const { error: err } = await supabase
            .from('saved_artworks')
            .delete()
            .eq('user_id', user.id)
            .eq('source', a.source)
            .eq('external_id', a.id);
          if (err) throw err;
        } else {
          const { error: err } = await supabase.from('saved_artworks').upsert(
            {
              user_id: user.id,
              source: a.source,
              external_id: a.id,
              snapshot: a as unknown as Record<string, unknown>,
            },
            { onConflict: 'user_id,source,external_id' }
          );
          if (err) throw err;
        }
        await queryClient.invalidateQueries({ queryKey: ['savedArtworks', user.id] });
      } catch (e) {
        console.error(e);
        alert(getErrorMessage(e));
      }
    },
    [queryClient, savedWorks, user]
  );

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

  async function handleAskSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    const q = askQuestion.trim();
    if (!q) return;
    setAskLoading(true);
    setAskError(null);
    setAskAnswer(null);
    try {
      const { answer } = await askAboutArtwork(selected, q);
      setAskAnswer(answer);
    } catch (err) {
      setAskError(getErrorMessage(err));
    } finally {
      setAskLoading(false);
    }
  }

  function openAsk(a: Artwork) {
    setSelected(a);
    setAskOpen(true);
    setAskQuestion('');
    setAskAnswer(null);
    setAskError(null);
  }

  function closeAsk() {
    setAskOpen(false);
  }

  const tabClass = (t: Tab) =>
    `px-4 py-2 rounded-full text-sm font-semibold transition ${
      tab === t ? 'bg-zinc-100 text-black' : 'bg-zinc-900 text-zinc-300 hover:text-white border border-zinc-800'
    }`;

  return (
    <div className="py-6 max-w-4xl mx-auto">
      <p className="text-zinc-400 text-sm m-0 mb-4">
        Open-access art from The Met, Europeana, and Wikidata. Rights vary by record; check attribution on each work.
      </p>

      <div className="flex flex-wrap gap-2 mb-6">
        <button type="button" className={tabClass('met')} onClick={() => setTab('met')}>
          The Met
        </button>
        <button type="button" className={tabClass('europeana')} onClick={() => setTab('europeana')}>
          Europeana
        </button>
        <button type="button" className={tabClass('wikidata')} onClick={() => setTab('wikidata')}>
          Wikidata
        </button>
      </div>

      {tab === 'europeana' && (
        <form
          className="flex flex-wrap gap-2 items-center mb-4"
          onSubmit={(e) => {
            e.preventDefault();
            setEuropeanaApplied(europeanaQ.trim() || 'painting');
          }}
        >
          <input
            type="search"
            value={europeanaQ}
            onChange={(e) => setEuropeanaQ(e.target.value)}
            placeholder="Search Europeana (e.g. painting, photo)"
            className="flex-1 min-w-[200px] rounded-full border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm outline-none focus:border-zinc-600"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-full bg-zinc-100 text-black text-sm font-semibold hover:bg-white"
          >
            Search
          </button>
        </form>
      )}

      {error && (
        <div className="rounded-xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-200 mb-4">
          {getErrorMessage(error)}
          {tab === 'europeana' && String(getErrorMessage(error)).includes('not configured') && (
            <span> Add EUROPEANA_API_KEY to Netlify env (see README).</span>
          )}
        </div>
      )}

      {isLoading && <p className="text-zinc-500">Loading…</p>}

      {!isLoading && !error && items.length === 0 && (
        <p className="text-zinc-500">No items returned. Try another tab or search.</p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {items.map((a) => {
          const thumb = a.thumbUrl ?? a.imageUrl;
          const wk = workKey(a);
          const ak = artistKey(a);
          const isSaved = savedWorks.has(wk);
          const artistSaved = ak ? savedArtists.has(ak) : false;
          return (
            <div
              key={wk}
              role="button"
              tabIndex={0}
              onClick={() => setSelected(a)}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') {
                  ev.preventDefault();
                  setSelected(a);
                }
              }}
              className="group text-left rounded-2xl border border-zinc-800 bg-zinc-950/80 overflow-hidden hover:border-zinc-600 transition focus:outline-none focus:ring-2 focus:ring-zinc-500 cursor-pointer"
            >
              <div className="aspect-square bg-zinc-900 relative">
                {thumb ? (
                  <img src={thumb} alt="" className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs p-2">No image</div>
                )}
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                  <button
                    type="button"
                    className="text-[10px] px-2 py-1 rounded-full bg-black/70 text-zinc-200"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      void toggleSaveWork(a);
                    }}
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
            </div>
          );
        })}
      </div>

      <div ref={loadMoreRef} className="h-8 mt-6 flex items-center justify-center text-zinc-500 text-sm">
        {isFetchingNextPage ? 'Loading more…' : hasNextPage ? '' : items.length > 0 ? 'End' : ''}
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
                  disabled={!user}
                  onClick={() => void toggleSaveWork(selected)}
                >
                  {savedWorks.has(workKey(selected)) ? 'Saved' : 'Save work'}
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
                  className="px-4 py-2 rounded-full border border-zinc-700 text-sm hover:bg-zinc-900"
                  onClick={() => openAsk(selected)}
                >
                  Ask AI
                </button>
              </div>
              {!user && <p className="m-0 text-xs text-amber-200/90">Sign in to save works and artists.</p>}
            </div>
          </div>
        </div>
      )}

      {askOpen && selected && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80"
          role="dialog"
          aria-modal
          aria-labelledby="ask-title"
          onClick={closeAsk}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-3">
              <h3 id="ask-title" className="m-0 text-base font-semibold">
                Ask about this work
              </h3>
              <button type="button" className="text-zinc-400 hover:text-white" aria-label="Close" onClick={closeAsk}>
                ×
              </button>
            </div>
            <p className="m-0 text-xs text-zinc-500 mb-2 line-clamp-2">{selected.title}</p>
            <form onSubmit={handleAskSubmit} className="space-y-3">
              <textarea
                value={askQuestion}
                onChange={(e) => setAskQuestion(e.target.value)}
                placeholder="e.g. What movement is this associated with?"
                rows={3}
                className="w-full rounded-xl border border-zinc-800 bg-black px-3 py-2 text-sm outline-none focus:border-zinc-600"
                maxLength={2000}
              />
              {askError && <p className="m-0 text-sm text-red-400">{askError}</p>}
              {askAnswer && <p className="m-0 text-sm text-zinc-300 whitespace-pre-wrap">{askAnswer}</p>}
              <button
                type="submit"
                disabled={askLoading || !askQuestion.trim()}
                className="w-full py-2 rounded-full bg-zinc-100 text-black font-semibold text-sm hover:bg-white disabled:opacity-50"
              >
                {askLoading ? 'Thinking…' : 'Ask'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
