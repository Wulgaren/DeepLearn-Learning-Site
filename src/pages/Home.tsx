import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getInterests, setInterests, getHomeTweets, createThreadFromTweet } from '../lib/api';

export default function Home() {
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [loadingInterests, setLoadingInterests] = useState(true);
  const [tweets, setTweets] = useState<string[]>([]);
  const [loadingTweets, setLoadingTweets] = useState(false);
  const [error, setError] = useState('');
  const [creatingTweet, setCreatingTweet] = useState<string | null>(null);
  const navigate = useNavigate();

  const loadInterests = useCallback(async () => {
    setLoadingInterests(true);
    setError('');
    try {
      const data = await getInterests();
      setTags(data.tags);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load interests');
    } finally {
      setLoadingInterests(false);
    }
  }, []);

  useEffect(() => {
    loadInterests();
  }, [loadInterests]);

  useEffect(() => {
    if (tags.length === 0) {
      setTweets([]);
      return;
    }
    let cancelled = false;
    setLoadingTweets(true);
    setError('');
    getHomeTweets()
      .then((data) => {
        if (!cancelled) setTweets(data.tweets);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load tweets');
      })
      .finally(() => {
        if (!cancelled) setLoadingTweets(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tags.length]);

  async function saveTags(newTags: string[]) {
    setError('');
    try {
      await setInterests(newTags);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save interests');
    }
  }

  async function handleAddTag(e: React.FormEvent) {
    e.preventDefault();
    const value = tagInput.trim();
    if (!value || tags.includes(value)) {
      setTagInput('');
      return;
    }
    const next = [...tags, value];
    setTagInput('');
    await saveTags(next);
    setTags(next);
  }

  async function handleRemoveTag(tag: string) {
    const next = tags.filter((t) => t !== tag);
    await saveTags(next);
    setTags(next);
  }

  async function handleTweetClick(tweet: string) {
    if (creatingTweet) return;
    setCreatingTweet(tweet);
    setError('');
    try {
      const { threadId } = await createThreadFromTweet(tweet);
      navigate(`/thread/${threadId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create thread');
      setCreatingTweet(null);
    }
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
                placeholder="Add an interest (e.g. React, history, cooking)"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                className="flex-1 px-4 py-2 rounded-full border border-zinc-800 bg-zinc-950/60 text-inherit text-sm placeholder:text-zinc-500 outline-none focus:ring-1 focus:ring-zinc-600"
              />
              <button
                type="submit"
                disabled={!tagInput.trim()}
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
        ) : loadingTweets ? (
          <p className="text-zinc-500 text-sm py-6">Loading tweet ideas…</p>
        ) : tweets.length === 0 ? (
          <p className="text-zinc-500 text-sm py-6">No tweet ideas right now. Try adding more interests.</p>
        ) : (
          <div className="divide-y divide-zinc-800/80">
            {tweets.map((tweet, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleTweetClick(tweet)}
                disabled={!!creatingTweet}
                className="w-full text-left px-1 py-4 hover:bg-zinc-950/60 transition border-b border-zinc-800/80 last:border-b-0 disabled:opacity-70"
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
                    <div className="mt-3 flex items-center gap-6 text-xs text-zinc-500">
                      <span>Click to open thread</span>
                      {creatingTweet === tweet && <span>Creating…</span>}
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
