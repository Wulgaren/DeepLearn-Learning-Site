import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createThreadFromTweet } from '../lib/api';
import { getErrorMessage } from '../lib/errors';

type ThreadNewState = { tweet?: string; mainImageUrl?: string | null };

/**
 * Creates a thread from navigation state or URL hash, then redirects to the thread.
 * - Hash: /thread/new#<encodeURIComponent(tweet)> (Home, shareable)
 * - State: navigate('/thread/new', { state: { tweet, mainImageUrl? } }) (Art “Learn more”)
 */
export default function NewThread() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const createMutation = useMutation({
    mutationFn: createThreadFromTweet,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['homeThreads'] });
      navigate(`/thread/${data.threadId}`, { replace: true });
    },
    onError: (err) => {
      setError(getErrorMessage(err));
    },
  });

  useEffect(() => {
    if (started.current) return;

    const st = location.state as ThreadNewState | null;
    let tweet: string | undefined;
    let mainImageUrl: string | null | undefined;

    if (st?.tweet?.trim()) {
      tweet = st.tweet.trim();
      mainImageUrl = st.mainImageUrl ?? undefined;
    } else {
      const rawHash = location.hash.slice(1);
      if (!rawHash) {
        queueMicrotask(() => setError('Missing suggestion'));
        return;
      }
      try {
        tweet = decodeURIComponent(rawHash);
      } catch {
        queueMicrotask(() => setError('Invalid link'));
        return;
      }
    }

    if (!tweet?.trim()) {
      queueMicrotask(() => setError('Missing suggestion'));
      return;
    }

    started.current = true;
    createMutation.mutate({ tweet: tweet.trim(), mainImageUrl });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- run once; location captured on mount

  if (error || createMutation.isError) {
    return (
      <div className="py-10 text-center">
        <p className="text-red-400 text-sm">{error ?? getErrorMessage(createMutation.error)}</p>
        <button
          type="button"
          onClick={() => navigate('/', { replace: true })}
          className="mt-4 px-4 py-2 rounded-full font-semibold bg-zinc-100 text-black hover:bg-white"
        >
          Back to Home
        </button>
      </div>
    );
  }

  return (
    <div className="py-10 text-center">
      <p className="text-zinc-400 text-sm">Creating thread…</p>
    </div>
  );
}
