import { Link } from 'react-router-dom';
import { formatThreadDate } from '../lib/format';
import { useArtRouteOptional } from '../contexts/ArtRouteContext';

function artistHref(source: string, externalId: string, label: string | null): string {
  const path = `/art/artist/${encodeURIComponent(source)}/${encodeURIComponent(externalId)}`;
  return label?.trim() ? `${path}?label=${encodeURIComponent(label.trim())}` : path;
}

export default function ArtRightRail() {
  const ctx = useArtRouteOptional();
  if (!ctx) return null;

  const {
    europeanaQ,
    setEuropeanaQ,
    applySearch,
    onShuffle,
    savedArtistsRows,
    artThreads,
  } = ctx;

  return (
    <div className="space-y-4">
      <form onSubmit={applySearch} className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3">
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
        {savedArtistsRows.length === 0 ? (
          <p className="m-0 mt-2 text-sm text-zinc-500">Save an artist from the detail modal.</p>
        ) : (
          <ul className="mt-2 space-y-1.5 list-none p-0 m-0 text-sm">
            {savedArtistsRows.map((r) => (
              <li key={`${r.source}:${r.external_id}`} className="truncate">
                <Link
                  to={artistHref(r.source, r.external_id, r.label)}
                  className="text-zinc-300 hover:text-white no-underline hover:underline"
                >
                  {r.label ?? `${r.source} · ${r.external_id}`}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
