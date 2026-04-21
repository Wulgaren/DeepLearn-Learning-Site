const STORAGE_KEY = 'deeplearn:artFeedSeed';

function freshSeed(): string {
  return `${crypto.randomUUID()}:0`;
}

/** Stable per browser tab until tab closes; survives ArtRouteProvider unmount. */
export function getArtFeedSeed(): string {
  try {
    let v = sessionStorage.getItem(STORAGE_KEY);
    if (!v) {
      v = freshSeed();
      sessionStorage.setItem(STORAGE_KEY, v);
    }
    return v;
  } catch {
    return freshSeed();
  }
}

/** Increment shuffle counter; persists and returns new feedSeed for React Query key. */
export function bumpArtFeedShuffle(): string {
  try {
    let cur = sessionStorage.getItem(STORAGE_KEY);
    if (!cur) cur = freshSeed();
    const lastColon = cur.lastIndexOf(':');
    const base = lastColon >= 0 ? cur.slice(0, lastColon) : cur;
    const n = lastColon >= 0 ? Number.parseInt(cur.slice(lastColon + 1), 10) : NaN;
    const nextN = Number.isFinite(n) ? n + 1 : 1;
    const next = `${base}:${nextN}`;
    sessionStorage.setItem(STORAGE_KEY, next);
    return next;
  } catch {
    return freshSeed();
  }
}
