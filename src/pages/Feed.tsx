import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getFeed, generateFeed } from '../lib/api';
import type { FeedTopic, ThreadSummary } from '../types';

export default function Feed() {
  const [topicInput, setTopicInput] = useState('');
  const [topics, setTopics] = useState<FeedTopic[]>([]);
  const [threadsByTopic, setThreadsByTopic] = useState<Record<string, ThreadSummary[]>>({});
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  async function loadFeed() {
    setLoading(true);
    setError('');
    try {
      const data = await getFeed();
      setTopics(data.topics);
      setThreadsByTopic(data.threadsByTopic);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFeed();
  }, []);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    const topic = topicInput.trim();
    if (!topic || generating) return;
    setGenerating(true);
    setError('');
    try {
      const data = await generateFeed(topic);
      setTopics((prev) => [{ id: data.topicId, query: topic, created_at: new Date().toISOString() }, ...prev]);
      setThreadsByTopic((prev) => ({
        ...prev,
        [data.topicId]: data.threads,
      }));
      setTopicInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="pb-8">
      <form onSubmit={handleGenerate} className="flex flex-col gap-3 mb-6">
        <input
          type="text"
          placeholder="Enter a topic you want to learn about…"
          value={topicInput}
          onChange={(e) => setTopicInput(e.target.value)}
          disabled={generating}
          className="px-4 py-3.5 rounded-lg border border-zinc-700 bg-zinc-800/50 text-inherit text-base placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={generating || !topicInput.trim()}
          className="px-4 py-3 rounded-lg border border-zinc-600 bg-zinc-700 font-medium hover:bg-zinc-600 disabled:opacity-50"
        >
          {generating ? 'Generating…' : 'Generate threads'}
        </button>
      </form>
      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      <section>
        <h2 className="text-sm font-semibold text-zinc-400 mb-4">My topics</h2>
        {loading ? (
          <p className="text-zinc-500 text-sm">Loading…</p>
        ) : topics.length === 0 ? (
          <p className="text-zinc-500 text-sm">
            No topics yet. Enter a topic above to generate your first threads.
          </p>
        ) : (
          <ul className="list-none p-0 m-0">
            {topics.map((topic) => (
              <li key={topic.id} className="mb-8">
                <h3 className="text-base font-semibold text-zinc-400 mb-3">{topic.query}</h3>
                <ul className="list-none p-0 m-0">
                  {(threadsByTopic[topic.id] ?? []).map((thread) => (
                    <li key={thread.id} className="mb-2">
                      <Link
                        to={`/thread/${thread.id}`}
                        className="block p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 text-inherit no-underline text-left transition border-zinc-700 hover:bg-zinc-800/80"
                      >
                        <p className="m-0 mb-1.5 text-sm leading-snug line-clamp-2">
                          {thread.main_post}
                        </p>
                        <span className="text-xs text-zinc-500">
                          {Array.isArray(thread.replies) ? thread.replies.length : 0} replies
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
