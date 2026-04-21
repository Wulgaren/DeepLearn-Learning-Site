import { Link } from 'react-router-dom';
import { formatThreadDate } from '../lib/format';
import { normalizeHttpsImageUrl } from '../lib/artRouteUtils';
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
        <input
          type="search"
          value={europeanaQ}
          onChange={(e) => setEuropeanaQ(e.target.value)}
          placeholder="e.g. painting, photo — Enter to apply"
          aria-label="Europeana search query"
          className="w-full px-4 py-2 rounded-full border border-zinc-800 bg-zinc-950/60 text-inherit text-sm placeholder:text-zinc-500 outline-none focus:ring-1 focus:ring-zinc-600"
        />
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={onShuffle}
            className="px-4 py-2 rounded-full font-semibold bg-zinc-100 text-black hover:bg-white text-sm"
          >
            Shuffle
          </button>
        </div>
      </form>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3">
        <h3 className="m-0 text-sm font-semibold">Saved artwork threads</h3>
        {artThreads.length === 0 ? (
          <p className="m-0 mt-2 text-sm text-zinc-500">Star a work to save a thread (AI when you open it).</p>
        ) : (
          <ul className="mt-2 space-y-2 list-none p-0 m-0 max-h-[min(50vh,320px)] overflow-y-auto">
            {artThreads.map((t) => {
              const thumb = normalizeHttpsImageUrl(t.main_image_url ?? null);
              return (
                <li key={t.id}>
                  <Link
                    to={`/thread/${t.id}`}
                    state={{ from: '/art' }}
                    className="flex gap-2 rounded-lg px-2 py-2 hover:bg-zinc-900/80 no-underline text-inherit items-start"
                  >
                    {thumb ? (
                      <img
                        src={thumb}
                        alt=""
                        className="w-12 h-12 shrink-0 rounded-md object-cover bg-zinc-900"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-12 h-12 shrink-0 rounded-md bg-zinc-900 border border-zinc-800" aria-hidden />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="m-0 text-sm text-zinc-200 line-clamp-2">{t.main_post}</p>
                      <p className="m-0 mt-1 text-[10px] text-zinc-500">
                        {t.expand_pending ? 'Pending · ' : ''}
                        {formatThreadDate(t.created_at)}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
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
