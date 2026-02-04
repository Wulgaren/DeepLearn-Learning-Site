import { useState, useEffect, useCallback } from 'react';
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

  const load = useCallback(async () => {
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
  }, [threadId]);

  useEffect(() => {
    load();
  }, [load]);

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
    <div className="pb-12">
      <div className="sticky top-[52px] z-[5] bg-black/70 backdrop-blur border-b border-zinc-800/80">
        <div className="px-1 py-2 flex items-center gap-3">
          <Link to="/" className="text-zinc-300 no-underline hover:text-white">
            ←
          </Link>
          <div className="min-w-0">
            <p className="m-0 text-sm font-semibold">Post</p>
            <p className="m-0 text-xs text-zinc-500 truncate">
              Thread details
            </p>
          </div>
        </div>
      </div>

      {/* Main post */}
      <article className="px-1 py-4 border-b border-zinc-800/80">
        <div className="flex gap-3">
          <div className="h-10 w-10 rounded-full bg-zinc-800 flex items-center justify-center text-xs text-zinc-300 shrink-0">
            AI
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-semibold">Thread</span>
              <span className="text-zinc-500">•</span>
              <span className="text-zinc-500 text-xs">
                {replies.length} replies
              </span>
            </div>
            <p className="m-0 mt-2 text-[1.05rem] leading-relaxed whitespace-pre-wrap break-words text-zinc-100">
              {thread.main_post}
            </p>
            <div className="mt-4 flex items-center gap-6 text-xs text-zinc-500">
              <span>Reply</span>
              <span>Repost</span>
              <span>Like</span>
              <span>Share</span>
            </div>
          </div>
        </div>
      </article>

      {/* Ask box */}
      <section className="px-1 py-4 border-b border-zinc-800/80">
        <form onSubmit={handleAsk} className="flex gap-3">
          <div className="h-10 w-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-xs text-zinc-400 shrink-0">
            You
          </div>
          <div className="flex-1">
            <input
              type="text"
              placeholder="Ask a follow-up question…"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              disabled={asking}
              className="w-full bg-transparent text-[1.05rem] placeholder:text-zinc-500 outline-none py-2 disabled:opacity-50"
            />
            <div className="mt-2 flex items-center justify-end">
              <button
                type="submit"
                disabled={asking || !question.trim()}
                className="px-4 py-2 rounded-full font-semibold bg-zinc-100 text-black hover:bg-white disabled:opacity-50 disabled:hover:bg-zinc-100"
              >
                {asking ? 'Asking…' : 'Ask'}
              </button>
            </div>
            {error && <p className="mt-2 text-red-400 text-sm">{error}</p>}
          </div>
        </form>
      </section>

      {/* Replies */}
      <section className="divide-y divide-zinc-800/80">
        {replies.map((reply, i) => (
          <article key={i} className="px-1 py-4 hover:bg-zinc-950/60 transition">
            <div className="flex gap-3">
              <div className="h-10 w-10 rounded-full bg-zinc-800 flex items-center justify-center text-xs text-zinc-300 shrink-0">
                AI
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-semibold text-zinc-200">Reply</span>
                  <span className="text-zinc-500">•</span>
                  <span className="text-zinc-500 text-xs">#{i + 1}</span>
                </div>
                <p className="m-0 mt-1 text-sm leading-relaxed whitespace-pre-wrap break-words text-zinc-200">
                  {reply}
                </p>
                <div className="mt-3 flex items-center gap-6 text-xs text-zinc-500">
                  <span>Reply</span>
                  <span>Like</span>
                  <span>Share</span>
                </div>
              </div>
            </div>
          </article>
        ))}
      </section>

      {/* Q&A */}
      {followUps.length > 0 && (
        <section className="mt-6">
          <h3 className="m-0 text-sm font-semibold text-zinc-400">Q&amp;A</h3>
          <div className="mt-3 space-y-3">
            {followUps.map((f) => (
              <div key={f.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
                <p className="m-0 text-sm leading-relaxed">
                  <span className="text-xs text-zinc-500 font-semibold">You </span>
                  <span className="text-zinc-200">{f.user_question}</span>
                </p>
                <div className="mt-3 border-t border-zinc-800/80 pt-3">
                  <p className="m-0 text-sm leading-relaxed">
                    <span className="text-xs text-zinc-500 font-semibold">AI </span>
                    <span className="text-zinc-200">{f.ai_answer}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
