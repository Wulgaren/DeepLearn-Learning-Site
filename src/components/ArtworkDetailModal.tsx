import { useCallback, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  artistKey,
  inAppArtistHref,
  threadNewHrefForArtwork,
  workKey,
} from '../lib/artRouteUtils';
import { useArtRoute } from '../contexts/ArtRouteContext';
import type { Artwork } from '../types/art';

type Props = {
  selected: Artwork | null;
  onClose: () => void;
  /**
   * On `/art/artist/:source/:externalId`, prefer this for “artist saved” — matches
   * `saved_artists` even if per-item `artist.id` from the API disagrees.
   */
  savedArtistLookupKey?: string | null;
  /** Same route; used for save/unsave so DB `external_id` matches the rail. */
  canonicalArtistExternalId?: string | null;
  /** Feed grid items; with `onNavigateTo` enables arrows, swipe, prev/next. */
  galleryItems?: Artwork[];
  onNavigateTo?: (work: Artwork) => void;
};

const SWIPE_MIN_PX = 56;

export default function ArtworkDetailModal({
  selected,
  onClose,
  savedArtistLookupKey = null,
  canonicalArtistExternalId = null,
  galleryItems,
  onNavigateTo,
}: Props) {
  const {
    user,
    saveArtMutation,
    savedArtists,
    threadIdByWork,
    toggleSaveArtist,
  } = useArtRoute();

  const dialogRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);

  const galleryIndex =
    selected && galleryItems?.length
      ? galleryItems.findIndex((a) => workKey(a) === workKey(selected))
      : -1;
  const hasGallery =
    Boolean(onNavigateTo && galleryItems && galleryItems.length > 1 && galleryIndex >= 0);
  const canPrev = hasGallery && galleryIndex > 0;
  const canNext = hasGallery && galleryIndex < galleryItems!.length - 1;

  const goPrev = useCallback(() => {
    if (!onNavigateTo || !galleryItems || galleryIndex <= 0) return;
    onNavigateTo(galleryItems[galleryIndex - 1]);
  }, [galleryIndex, galleryItems, onNavigateTo]);

  const goNext = useCallback(() => {
    if (!onNavigateTo || !galleryItems || galleryIndex < 0 || galleryIndex >= galleryItems.length - 1) {
      return;
    }
    onNavigateTo(galleryItems[galleryIndex + 1]);
  }, [galleryIndex, galleryItems, onNavigateTo]);

  useEffect(() => {
    if (!selected) return;
    dialogRef.current?.focus({ preventScroll: true });
  }, [selected]);

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (!hasGallery) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, hasGallery, onClose, goPrev, goNext]);

  if (!selected) return null;

  const workSavedAsThread = threadIdByWork.has(workKey(selected));
  const artistLookupKey = savedArtistLookupKey ?? artistKey(selected);
  const artistIsSaved = Boolean(artistLookupKey && savedArtists.has(artistLookupKey));

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex min-h-[100dvh] items-end sm:items-center justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4 bg-black/70 backdrop-blur-sm outline-none"
      role="dialog"
      aria-modal
      aria-labelledby="art-detail-title"
      onClick={() => onClose()}
    >
      <div
        className="w-full min-h-0 max-w-lg max-sm:min-h-[min(76dvh,82svh)] max-h-[min(94dvh,94svh)] sm:max-h-[min(90vh,90svh)] overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 shadow-xl"
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
            <div
              className="relative w-full min-h-0 flex justify-center items-center rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden touch-pan-y"
              onTouchStart={(e) => {
                if (e.touches.length !== 1) return;
                touchStartX.current = e.touches[0].clientX;
              }}
              onTouchEnd={(e) => {
                if (touchStartX.current == null || !hasGallery) {
                  touchStartX.current = null;
                  return;
                }
                const endX = e.changedTouches[0]?.clientX;
                if (endX == null) {
                  touchStartX.current = null;
                  return;
                }
                const dx = endX - touchStartX.current;
                touchStartX.current = null;
                if (Math.abs(dx) < SWIPE_MIN_PX) return;
                if (dx > 0) goPrev();
                else goNext();
              }}
              onTouchCancel={() => {
                touchStartX.current = null;
              }}
            >
              {hasGallery && (
                <>
                  <button
                    type="button"
                    aria-label="Previous artwork"
                    disabled={!canPrev}
                    className="absolute left-1 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/55 p-2 text-zinc-100 hover:bg-black/75 disabled:opacity-30 disabled:pointer-events-none sm:left-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      goPrev();
                    }}
                  >
                    <span aria-hidden className="block text-lg leading-none">
                      ‹
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label="Next artwork"
                    disabled={!canNext}
                    className="absolute right-1 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/55 p-2 text-zinc-100 hover:bg-black/75 disabled:opacity-30 disabled:pointer-events-none sm:right-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      goNext();
                    }}
                  >
                    <span aria-hidden className="block text-lg leading-none">
                      ›
                    </span>
                  </button>
                </>
              )}
              <img
                src={selected.imageUrl ?? selected.thumbUrl ?? ''}
                alt=""
                draggable={false}
                className="max-w-full max-h-[min(58dvh,58svh,560px)] sm:max-h-[min(52svh,560px)] w-auto h-auto object-contain object-center select-none"
              />
            </div>
          )}
          {selected.description && <p className="m-0 text-sm text-zinc-300">{selected.description}</p>}
          {selected.rights && (
            <p className="m-0 text-xs text-zinc-500">{selected.rights}</p>
          )}
          {selected.attribution && (
            <p className="m-0 text-xs text-zinc-500">{selected.attribution}</p>
          )}
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
              {inAppArtistHref(selected) ? (
                <Link
                  to={inAppArtistHref(selected)!}
                  className="text-sm text-sky-400 hover:underline"
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                    onClose();
                  }}
                >
                  {selected.artist.label}
                </Link>
              ) : selected.artist.wikiUrl ? (
                <a
                  href={selected.artist.wikiUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-sky-400 hover:underline"
                >
                  {selected.artist.label}
                </a>
              ) : (
                <span className="text-sm text-zinc-200">{selected.artist.label}</span>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-100 text-black text-sm font-semibold hover:bg-white disabled:opacity-50"
              disabled={!user || saveArtMutation.isPending}
              onClick={() =>
                saveArtMutation.mutate({
                  a: selected,
                  save: !workSavedAsThread,
                  existingThreadId: threadIdByWork.get(workKey(selected)),
                })
              }
            >
              <svg
                className="w-4 h-4 shrink-0"
                viewBox="0 0 24 24"
                fill={workSavedAsThread ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth={workSavedAsThread ? 0 : 1.75}
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.611l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
                />
              </svg>
              {workSavedAsThread ? 'Saved' : 'Save'}
            </button>
            <button
              type="button"
              className="px-4 py-2 rounded-full border border-zinc-700 text-sm hover:bg-zinc-900 disabled:opacity-50"
              disabled={!user || !artistLookupKey}
              onClick={() =>
                void toggleSaveArtist(selected, {
                  artistExternalIdOverride: canonicalArtistExternalId ?? undefined,
                })
              }
            >
              {artistIsSaved ? 'Artist saved' : 'Save artist'}
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
