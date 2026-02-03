import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getThread, askThread } from '../lib/api';
import type { ThreadWithFollowUps } from '../types';

export default function Thread() {
  const { threadId } = useParams<{ threadId: string }>();
  const [data, setData] = useState<ThreadWithFollowUps | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);

  async function load() {
    if (!threadId) return;
    setLoading(true);
    setError('');
    try {
      const result = await getThread(threadId);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load thread');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [threadId]);

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    if (!threadId || !question.trim() || asking) return;
    setAsking(true);
    setError('');
    try {
      const result = await askThread(threadId, question.trim());
      setData((prev) =>
        prev
          ? {
              ...prev,
              followUps: [...prev.followUps, result.followUp],
            }
          : null
      );
      setQuestion('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get answer');
    } finally {
      setAsking(false);
    }
  }

  if (loading) return <p className="py-4 text-zinc-500">Loading thread…</p>;
  if (error && !data) return <p className="py-4 text-red-400">{error}</p>;
  if (!data) return null;

  const { thread, followUps } = data;
  const replies = Array.isArray(thread.replies) ? thread.replies : [];

  return (
    <div className="pb-8">
      <p className="mb-4 text-sm">
        <Link to="/" className="text-zinc-500 no-underline hover:text-blue-400">
          ← Back to feed
        </Link>
      </p>
      <article className="py-4 border-b border-zinc-800">
        <p className="m-0 text-[1.05rem] font-medium leading-relaxed whitespace-pre-wrap break-words">
          {thread.main_post}
        </p>
      </article>
      <div className="space-y-2">
        {replies.map((reply, i) => (
          <article
            key={i}
            className="py-4 pl-6 ml-2 border-l-2 border-zinc-800 text-zinc-300"
          >
            <p className="m-0 text-sm leading-relaxed whitespace-pre-wrap break-words">
              {reply}
            </p>
          </article>
        ))}
      </div>
      {followUps.length > 0 && (
        <section className="mt-6 pt-4 border-t border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-500 mb-4">Q&A</h3>
          <div className="space-y-4">
            {followUps.map((f) => (
              <div
                key={f.id}
                className="p-3 rounded-lg bg-zinc-900/80 border border-zinc-800"
              >
                <p className="m-0 mb-1 text-sm leading-snug">
                  <span className="text-xs text-zinc-500 font-medium">You: </span>
                  {f.user_question}
                </p>
                <p className="m-0 text-sm leading-snug">
                  <span className="text-xs text-zinc-500 font-medium">AI: </span>
                  {f.ai_answer}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
      <form onSubmit={handleAsk} className="flex gap-2 mt-6">
        <input
          type="text"
          placeholder="Ask a follow-up question…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={asking}
          className="flex-1 px-4 py-3 rounded-lg border border-zinc-700 bg-zinc-800/50 text-inherit text-base placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={asking || !question.trim()}
          className="px-5 py-3 rounded-lg border border-zinc-600 bg-zinc-700 font-medium hover:bg-zinc-600 disabled:opacity-50"
        >
          {asking ? 'Asking…' : 'Ask'}
        </button>
      </form>
      {error && <p className="mt-2 text-red-400 text-sm">{error}</p>}
    </div>
  );
}
