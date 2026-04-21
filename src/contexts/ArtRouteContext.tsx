/* Context module exports provider + hooks; utils live in lib/artRouteUtils.ts */
/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createThreadFromTweet, getArtThreads } from '../lib/api';
import { artworkToMainTweet, catalogPageUrl } from '../lib/artTweet';
import { artistKey, normalizeHttpsImageUrl } from '../lib/artRouteUtils';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { getErrorMessage } from '../lib/errors';
import { bumpArtFeedShuffle, getArtFeedSeed } from '../lib/artFeedSeed';
import type { Artwork } from '../types/art';
import type { ArtThreadSummary } from '../types';

type SavedArtistRow = { source: string; external_id: string; label: string | null };

export type ArtRouteContextValue = {
  user: ReturnType<typeof useAuth>['user'];
  qApplied: string;
  europeanaQ: string;
  setEuropeanaQ: (s: string) => void;
  applySearch: (e: React.FormEvent) => void;
  onShuffle: () => void;
  feedSeed: string;
  artThreads: ArtThreadSummary[];
  savedArtistsRows: SavedArtistRow[];
  savedArtists: Set<string>;
  threadIdByWork: Map<string, string>;
  saveArtMutation: {
    mutate: (args: {
      a: Artwork;
      save: boolean;
      existingThreadId?: string | null;
    }) => void;
    isPending: boolean;
  };
  toggleSaveArtist: (a: Artwork) => Promise<void>;
};

const ArtRouteContext = createContext<ArtRouteContextValue | null>(null);

export function ArtRouteProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const qApplied = searchParams.get('q')?.trim() || 'painting';
  const [europeanaQ, setEuropeanaQ] = useState(qApplied);
  const [feedSeed, setFeedSeed] = useState(() => getArtFeedSeed());

  useEffect(() => {
    setEuropeanaQ(searchParams.get('q')?.trim() || 'painting');
  }, [searchParams]);

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
      return (data ?? []) as SavedArtistRow[];
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
          mainImageUrl: normalizeHttpsImageUrl(a.imageUrl ?? a.thumbUrl ?? null),
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

  const applySearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const q = europeanaQ.trim() || 'painting';
      if (location.pathname.startsWith('/art')) {
        const next = new URLSearchParams(searchParams);
        next.set('q', q);
        setSearchParams(next);
      } else {
        navigate({ pathname: '/art', search: `?q=${encodeURIComponent(q)}` });
      }
    },
    [europeanaQ, searchParams, setSearchParams, navigate, location.pathname]
  );

  const value: ArtRouteContextValue = {
    user,
    qApplied,
    europeanaQ,
    setEuropeanaQ,
    applySearch,
    onShuffle: () => setFeedSeed(bumpArtFeedShuffle()),
    feedSeed,
    artThreads: artThreadsData?.threads ?? [],
    savedArtistsRows: savedArtistsRows ?? [],
    savedArtists,
    threadIdByWork,
    saveArtMutation,
    toggleSaveArtist,
  };

  return <ArtRouteContext.Provider value={value}>{children}</ArtRouteContext.Provider>;
}

export function useArtRoute(): ArtRouteContextValue {
  const ctx = useContext(ArtRouteContext);
  if (!ctx) throw new Error('useArtRoute must be used under ArtRouteProvider');
  return ctx;
}

/** Layout rail only mounts under provider; safe no-op if missing. */
export function useArtRouteOptional(): ArtRouteContextValue | null {
  return useContext(ArtRouteContext);
}
