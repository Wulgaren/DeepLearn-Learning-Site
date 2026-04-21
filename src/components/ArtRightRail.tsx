import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatThreadDate } from '../lib/format';
import { normalizeHttpsImageUrl } from '../lib/artRouteUtils';
import { useArtRouteOptional } from '../contexts/ArtRouteContext';

function artistHref(source: string, externalId: string, label: string | null): string {
  const path = `/art/artist/${encodeURIComponent(source)}/${encodeURIComponent(externalId)}`;
  return label?.trim() ? `${path}?label=${encodeURIComponent(label.trim())}` : path;
}

function CollapsibleRailSection({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950/60 overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-2 p-3 text-left hover:bg-zinc-900/40 transition-colors"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
      >
        <h3 className="m-0 text-sm font-semibold">{title}</h3>
        <span className="text-zinc-500 text-[10px] shrink-0 tabular-nums" aria-hidden>
          {open ? '▼' : '▶'}
        </span>
      </button>
      {open && (
        <div id={panelId} className="px-3 pb-3 border-t border-zinc-800/80">
          {children}
        </div>
      )}
    </section>
  );
}

export default function ArtRightRail({ compactRail = false }: { compactRail?: boolean }) {
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

  const threadsBody =
    artThreads.length === 0 ? (
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
    );

  const artistsBody =
    savedArtistsRows.length === 0 ? (
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
    );

  return (
    <div className={`space-y-4 ${compactRail ? 'pt-3' : ''}`}>
      <form onSubmit={applySearch} className="flex items-center gap-2 min-w-0">
        <div className="flex-1 min-w-0 h-10 rounded-full border border-zinc-600 bg-zinc-950/60 px-4 flex items-center">
          <input
            type="search"
            value={europeanaQ}
            onChange={(e) => setEuropeanaQ(e.target.value)}
            placeholder="e.g. painting, photo — Enter to apply"
            aria-label="Europeana search query"
            className="w-full min-w-0 h-full min-h-0 bg-transparent outline-none text-sm placeholder:text-zinc-500 appearance-none rounded-full [-webkit-appearance:none]"
          />
        </div>
        <button
          type="button"
          onClick={onShuffle}
          className="shrink-0 h-10 px-4 rounded-full border border-zinc-600 font-semibold bg-zinc-100 text-black hover:bg-white text-sm inline-flex items-center justify-center"
        >
          Shuffle
        </button>
      </form>

      {compactRail ? (
        <>
          <CollapsibleRailSection title="Saved artwork threads" defaultOpen={false}>
            {threadsBody}
          </CollapsibleRailSection>
          <CollapsibleRailSection title="Saved artists" defaultOpen={false}>
            {artistsBody}
          </CollapsibleRailSection>
        </>
      ) : (
        <>
          <section className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3">
            <h3 className="m-0 text-sm font-semibold">Saved artwork threads</h3>
            {threadsBody}
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3">
            <h3 className="m-0 text-sm font-semibold">Saved artists</h3>
            {artistsBody}
          </section>
        </>
      )}
    </div>
  );
}
