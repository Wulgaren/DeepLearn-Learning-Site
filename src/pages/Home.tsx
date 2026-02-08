import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getInterests, setInterests, getHomeTweets, getHomeThreads } from '../lib/api';
import { getErrorMessage } from '../lib/errors';
import { formatThreadDate } from '../lib/format';
import { useCopyLink } from '../hooks/useCopyLink';
import CopyLinkToast from '../components/CopyLinkToast';
import PostRow from '../components/PostRow';
import type { ThreadSummary } from '../types';

export default function Home() {
  const [tagInput, setTagInput] = useState('');
  const { copyLink, linkCopied } = useCopyLink();
  const queryClient = useQueryClient();

  const { data: interestsData, isLoading: loadingInterests, error: interestsError } = useQuery({
    queryKey: ['interests'],
    queryFn: getInterests,
  });
  const tags = interestsData?.tags ?? [];

  const { data: homeThreadsData, isLoading: loadingHomeThreads } = useQuery({
    queryKey: ['homeThreads'],
    queryFn: getHomeThreads,
  });
  const homeThreads = homeThreadsData?.threads ?? [];

  const { data: tweetsData, isLoading: loadingTweets, error: tweetsError } = useQuery({
    queryKey: ['homeTweets'],
    queryFn: getHomeTweets,
    enabled: tags.length > 0,
  });
  const tweets = tweetsData?.tweets ?? [];

  const setInterestsMutation = useMutation({
    mutationFn: setInterests,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['interests'] });
      queryClient.invalidateQueries({ queryKey: ['homeTweets'] });
    },
  });

  const err = interestsError ?? tweetsError ?? setInterestsMutation.error;
  const error = err != null ? getErrorMessage(err) : undefined;

  function handleAddTag(e: React.FormEvent) {
    e.preventDefault();
    const raw = tagInput.trim();
    if (!raw) {
      setTagInput('');
      return;
    }
    const newTags = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((t) => !tags.includes(t));
    if (newTags.length === 0) {
      setTagInput('');
      return;
    }
    const next = [...tags, ...newTags];
    setTagInput('');
    setInterestsMutation.mutate(next);
  }

  function handleRemoveTag(tag: string) {
    const next = tags.filter((t) => t !== tag);
    setInterestsMutation.mutate(next);
  }

  function handleShare(e: React.MouseEvent, threadId: string) {
    e.preventDefault();
    e.stopPropagation();
    void copyLink(threadId);
  }

  return (
    <div className="pb-10">
      <CopyLinkToast show={linkCopied} />
      {/* Interests */}
      <section className="py-4 border-b border-zinc-800/80">
        <h2 className="text-sm font-semibold text-zinc-400 mb-3">Your interests</h2>
        {loadingInterests ? (
          <p className="text-zinc-500 text-sm">Loading…</p>
        ) : (
          <>
            <form onSubmit={handleAddTag} className="flex gap-2 mb-3">
              <input
                type="text"
                placeholder="Add interests (comma-separated, e.g. React, history, cooking)"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                className="flex-1 px-4 py-2 rounded-full border border-zinc-800 bg-zinc-950/60 text-inherit text-sm placeholder:text-zinc-500 outline-none focus:ring-1 focus:ring-zinc-600"
              />
              <button
                type="submit"
                disabled={!tagInput.trim() || setInterestsMutation.isPending}
                className="px-4 py-2 rounded-full font-semibold bg-zinc-100 text-black hover:bg-white disabled:opacity-50 text-sm"
              >
                Add
              </button>
            </form>
            {tags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-800/80 text-sm text-zinc-200"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="text-zinc-500 hover:text-zinc-100"
                      aria-label={`Remove ${tag}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-zinc-500 text-sm">Add interests above to get personalized tweet ideas.</p>
            )}
          </>
        )}
        {error && <p className="mt-3 text-red-400 text-sm">{error}</p>}
      </section>

      {/* Tweets */}
      <section className="pt-4">
        <h2 className="text-sm font-semibold text-zinc-400 mb-3">For you</h2>
        {tags.length === 0 ? (
          <p className="text-zinc-500 text-sm py-6">
            Add interests above, then open Home to see personalized tweet ideas.
          </p>
        ) : loadingTweets && tweets.length === 0 ? (
          <p className="text-zinc-500 text-sm py-6">Loading tweet ideas…</p>
        ) : tweets.length === 0 ? (
          <p className="text-zinc-500 text-sm py-6">No tweet ideas right now. Try adding more interests.</p>
        ) : (
          <div className="divide-y divide-zinc-800/80">
            {tweets.map((tweet, i) => (
              <PostRow
                key={`${i}-${tweet.slice(0, 40)}`}
                as="link"
                to={`/thread/new#${encodeURIComponent(tweet)}`}
                label="For you"
                body={tweet}
              />
            ))}
          </div>
        )}
      </section>

      {/* Your threads (saved from Home) */}
      <section className="pt-6 border-t border-zinc-800/80">
        <h2 className="text-sm font-semibold text-zinc-400 mb-3">Your threads</h2>
        {loadingHomeThreads ? (
          <p className="text-zinc-500 text-sm">Loading…</p>
        ) : homeThreads.length === 0 ? (
          <p className="text-zinc-500 text-sm">Threads you open from the suggestions above will appear here.</p>
        ) : (
          <div className="divide-y divide-zinc-800/80">
            {homeThreads.map((thread: ThreadSummary) => (
              <PostRow
                key={thread.id}
                as="link"
                to={`/thread/${thread.id}`}
                label="Thread"
                meta={`${Array.isArray(thread.replies) ? thread.replies.length : 0} replies · ${formatThreadDate(thread.created_at)}`}
                body={thread.main_post}
                lineClamp={2}
                actions={
                  <button
                    type="button"
                    onClick={(e) => handleShare(e, thread.id)}
                    className="hover:text-zinc-300"
                  >
                    Share
                  </button>
                }
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
