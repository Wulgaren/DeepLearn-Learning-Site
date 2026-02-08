import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createThreadFromTweet } from '../lib/api';
import { getErrorMessage } from '../lib/errors';

/**
 * Creates a thread from the suggestion in the URL hash, then redirects to the thread.
 * URL format: /thread/new#<encodeURIComponent(tweet)>
 * Enables native "Open link in new tab" — creation happens when the link is opened.
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
    const rawHash = location.hash.slice(1);
    if (!rawHash) {
      setError('Missing suggestion');
      return;
    }
    let tweet: string;
    try {
      tweet = decodeURIComponent(rawHash);
    } catch {
      setError('Invalid link');
      return;
    }
    if (!tweet.trim()) {
      setError('Missing suggestion');
      return;
    }
    started.current = true;
    createMutation.mutate(tweet);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- run once on mount

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
