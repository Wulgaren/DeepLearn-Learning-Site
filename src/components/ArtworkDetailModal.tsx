import { Link } from 'react-router-dom';
import {
  artistKey,
  metArtistUrl,
  threadNewHrefForArtwork,
  workKey,
} from '../lib/artRouteUtils';
import { useArtRoute } from '../contexts/ArtRouteContext';
import type { Artwork } from '../types/art';

type Props = {
  selected: Artwork | null;
  onClose: () => void;
};

export default function ArtworkDetailModal({ selected, onClose }: Props) {
  const {
    user,
    saveArtMutation,
    savedArtists,
    threadIdByWork,
    toggleSaveArtist,
  } = useArtRoute();

  if (!selected) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal
      aria-labelledby="art-detail-title"
      onClick={() => onClose()}
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
            onClick={() => onClose()}
          >
            ×
          </button>
        </div>
        <div className="p-4 space-y-3">
          {(selected.imageUrl || selected.thumbUrl) && (
            <div className="w-full min-h-0 flex justify-center items-center rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
              <img
                src={selected.imageUrl ?? selected.thumbUrl ?? ''}
                alt=""
                className="max-w-full max-h-[min(52vh,560px)] w-auto h-auto object-contain object-center"
              />
            </div>
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
              {artistKey(selected) && savedArtists.has(artistKey(selected)!)
                ? 'Artist saved'
                : 'Save artist'}
            </button>
            <Link
              to={user ? threadNewHrefForArtwork(selected) : '#'}
              className={`inline-flex items-center justify-center px-4 py-2 rounded-full border border-zinc-700 text-sm hover:bg-zinc-900 no-underline text-inherit ${
                !user ? 'opacity-50 pointer-events-none' : ''
              }`}
              aria-disabled={!user}
              tabIndex={!user ? -1 : undefined}
              onClick={(e) => {
                if (!user) {
                  e.preventDefault();
                  return;
                }
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                onClose();
              }}
            >
              Learn more
            </Link>
          </div>
          {!user && (
            <p className="m-0 text-xs text-amber-200/90">Sign in to save threads and use Learn more.</p>
          )}
        </div>
      </div>
    </div>
  );
}
