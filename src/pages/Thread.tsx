import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getThread, askThread } from '../lib/api';

export default function Thread() {
  const { threadId } = useParams<{ threadId: string }>();
  const [question, setQuestion] = useState('');
  const [showReplyForm, setShowReplyForm] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading: loading, error: threadError } = useQuery({
    queryKey: ['thread', threadId],
    queryFn: () => getThread(threadId!),
    enabled: !!threadId,
  });

  const askMutation = useMutation({
    mutationFn: ({ q }: { q: string }) => askThread(threadId!, q),
    onSuccess: (result) => {
      queryClient.setQueryData(['thread', threadId], (prev: typeof data) =>
        prev ? { ...prev, followUps: [...prev.followUps, result.followUp] } : prev
      );
      setQuestion('');
    },
  });

  const error = threadError instanceof Error ? threadError.message : threadError ? String(threadError) : askMutation.error instanceof Error ? askMutation.error.message : askMutation.error ? String(askMutation.error) : undefined;

  function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!threadId || !q || askMutation.isPending) return;
    askMutation.mutate({ q });
  }

  function getThreadUrl(id: string) {
    return `${window.location.origin}/thread/${id}`;
  }

  function handleShare() {
    if (!threadId) return;
    void navigator.clipboard.writeText(getThreadUrl(threadId));
  }

  if (loading) return <p className="py-4 text-zinc-500">Loading thread…</p>;
  if (threadError && !data) return <p className="py-4 text-red-400">{error}</p>;
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
              <button
                type="button"
                onClick={() => setShowReplyForm((v) => !v)}
                className="hover:text-zinc-300 bg-transparent border-0 p-0 cursor-pointer"
              >
                Reply
              </button>
              <button
                type="button"
                onClick={handleShare}
                className="hover:text-zinc-300 bg-transparent border-0 p-0 cursor-pointer"
              >
                Share
              </button>
            </div>
          </div>
        </div>
      </article>

      {/* Ask box – only when Reply was clicked */}
      {showReplyForm && (
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
                disabled={askMutation.isPending}
                className="w-full bg-transparent text-[1.05rem] placeholder:text-zinc-500 outline-none py-2 disabled:opacity-50"
              />
              <div className="mt-2 flex items-center justify-end">
                <button
                  type="submit"
                  disabled={askMutation.isPending || !question.trim()}
                  className="px-4 py-2 rounded-full font-semibold bg-zinc-100 text-black hover:bg-white disabled:opacity-50 disabled:hover:bg-zinc-100"
                >
                  {askMutation.isPending ? 'Asking…' : 'Ask'}
                </button>
              </div>
              {error && <p className="mt-2 text-red-400 text-sm">{error}</p>}
            </div>
          </form>
        </section>
      )}

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
