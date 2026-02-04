import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getInterests, setInterests, getHomeTweets, createThreadFromTweet, getHomeThreads } from '../lib/api';

type HomeThread = { id: string; main_post: string; replies: string[]; created_at: string };

export default function Home() {
  const [tagInput, setTagInput] = useState('');
  const [creatingTweet, setCreatingTweet] = useState<string | null>(null);
  const navigate = useNavigate();
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

  const createThreadMutation = useMutation({
    mutationFn: createThreadFromTweet,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['homeThreads'] });
      navigate(`/thread/${data.threadId}`);
    },
    onError: () => {
      setCreatingTweet(null);
    },
  });

  const err = interestsError ?? tweetsError ?? setInterestsMutation.error ?? createThreadMutation.error;
  const error = err instanceof Error ? err.message : err ? String(err) : undefined;

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

  function handleTweetClick(tweet: string) {
    if (creatingTweet) return;
    setCreatingTweet(tweet);
    createThreadMutation.mutate(tweet);
  }

  function handleOpenThread(threadId: string) {
    navigate(`/thread/${threadId}`);
  }

  function getThreadUrl(id: string) {
    return `${window.location.origin}/thread/${id}`;
  }

  function handleShare(e: React.MouseEvent, threadId: string) {
    e.preventDefault();
    e.stopPropagation();
    const url = getThreadUrl(threadId);
    void navigator.clipboard.writeText(url).then(() => {
      // Optional: toast or brief "Copied!" feedback
    });
  }

  return (
    <div className="pb-10">
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
              <button
                key={`${i}-${tweet.slice(0, 40)}`}
                type="button"
                onClick={() => handleTweetClick(tweet)}
                disabled={!!creatingTweet}
                className="w-full text-left px-1 py-4 hover:bg-zinc-950/60 transition border-b border-zinc-800/80 last:border-b-0 disabled:opacity-70 cursor-pointer"
                style={{ cursor: creatingTweet ? undefined : 'pointer' }}
              >
                <div className="flex gap-3">
                  <div className="h-10 w-10 rounded-full bg-zinc-800 flex items-center justify-center text-xs text-zinc-300 shrink-0">
                    AI
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-semibold text-zinc-100">For you</span>
                    </div>
                    <p className="m-0 mt-1 text-sm leading-relaxed text-zinc-200">
                      {tweet}
                    </p>
                    {creatingTweet === tweet && (
                      <p className="m-0 mt-2 text-xs text-zinc-500">Creating…</p>
                    )}
                  </div>
                </div>
              </button>
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
            {homeThreads.map((thread: HomeThread) => (
              <button
                key={thread.id}
                type="button"
                onClick={() => handleOpenThread(thread.id)}
                className="w-full text-left px-1 py-4 hover:bg-zinc-950/60 transition border-b border-zinc-800/80 last:border-b-0 cursor-pointer"
                style={{ cursor: 'pointer' }}
              >
                <div className="flex gap-3">
                  <div className="h-10 w-10 rounded-full bg-zinc-800 flex items-center justify-center text-xs text-zinc-300 shrink-0">
                    AI
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-semibold text-zinc-100">Thread</span>
                      <span className="text-zinc-500">•</span>
                      <span className="text-zinc-500 text-xs">
                        {Array.isArray(thread.replies) ? thread.replies.length : 0} replies
                      </span>
                    </div>
                    <p className="m-0 mt-1 text-sm leading-relaxed text-zinc-200 line-clamp-2">
                      {thread.main_post}
                    </p>
                    <div className="mt-2 flex items-center gap-4 text-xs text-zinc-500">
                      <button
                        type="button"
                        onClick={(e) => handleShare(e, thread.id)}
                        className="hover:text-zinc-300"
                      >
                        Share
                      </button>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
