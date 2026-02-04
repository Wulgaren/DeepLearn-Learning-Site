import { useState, useRef, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getThread, askThread } from '../lib/api';
import { getErrorMessage } from '../lib/errors';
import { useCopyLink } from '../hooks/useCopyLink';
import CopyLinkToast from '../components/CopyLinkToast';
import PostRow from '../components/PostRow';

export default function Thread() {
  const { threadId } = useParams<{ threadId: string }>();
  const [question, setQuestion] = useState('');
  /** null = form under main post; number = form under that reply index */
  const [replyFormAnchor, setReplyFormAnchor] = useState<number | null>(null);
  const qaSectionRef = useRef<HTMLElement>(null);
  const qaListRef = useRef<HTMLDivElement>(null);
  const mainInputRef = useRef<HTMLInputElement>(null);
  const replyInputRef = useRef<HTMLInputElement>(null);

  // Focus the visible reply input when opening a reply form
  useEffect(() => {
    const focusInput = () => {
      if (replyFormAnchor === null) {
        mainInputRef.current?.focus();
      } else {
        replyInputRef.current?.focus();
      }
    };
    requestAnimationFrame(focusInput);
  }, [replyFormAnchor]);
  const { copyLink, linkCopied } = useCopyLink();
  const queryClient = useQueryClient();

  const { data, isLoading: loading, error: threadError } = useQuery({
    queryKey: ['thread', threadId],
    queryFn: () => getThread(threadId!),
    enabled: !!threadId,
  });

  const askMutation = useMutation({
    mutationFn: ({ q, replyContext }: { q: string; replyContext?: string }) =>
      askThread(threadId!, q, replyContext),
    onSuccess: (result) => {
      queryClient.setQueryData(['thread', threadId], (prev: typeof data) =>
        prev ? { ...prev, followUps: [...prev.followUps, result.followUp] } : prev
      );
      setQuestion('');
      // Blur so scroll isn't overridden by browser keeping focused input in view
      (document.activeElement as HTMLElement)?.blur();
      // Scroll to Q&A section and to the new item after DOM updates
      setTimeout(() => {
        qaSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (qaListRef.current) {
          qaListRef.current.scrollTop = qaListRef.current.scrollHeight;
        }
      }, 100);
    },
  });

  const error =
    (threadError != null ? getErrorMessage(threadError) : undefined) ??
    (askMutation.error != null ? getErrorMessage(askMutation.error) : undefined);

  function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!threadId || !q || askMutation.isPending) return;
    const context = replyFormAnchor !== null && replies[replyFormAnchor] != null ? replies[replyFormAnchor] : undefined;
    askMutation.mutate({ q, replyContext: context });
  }

  function handleShare() {
    if (!threadId) return;
    void copyLink(threadId);
  }

  if (loading) return <p className="py-4 text-zinc-500">Loading thread…</p>;
  if (threadError && !data) return <p className="py-4 text-red-400">{error}</p>;
  if (!data) return null;

  const { thread, followUps } = data;
  const replies = Array.isArray(thread.replies) ? thread.replies : [];

  return (
    <div className="pb-12">
      <CopyLinkToast show={linkCopied} />
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
      <article className="border-b border-zinc-800/80">
        <PostRow
          as="div"
          label="Thread"
          meta={`${replies.length} replies`}
          body={thread.main_post}
          bodyClassName="mt-2 text-[1.05rem] leading-relaxed whitespace-pre-wrap break-words text-zinc-100"
          actionClassName="mt-4 flex items-center gap-6 text-xs text-zinc-500"
          actions={
            <>
              <button
                type="button"
                onClick={() => setReplyFormAnchor(null)}
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
            </>
          }
        />
      </article>

      {/* Ask box – under main post when anchor is null */}
      {replyFormAnchor === null && (
        <section className="px-1 py-4 border-b border-zinc-800/80">
          <form onSubmit={handleAsk} className="flex gap-3">
            <div className="h-10 w-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-xs text-zinc-400 shrink-0">
              You
            </div>
            <div className="flex-1">
              <input
                ref={mainInputRef}
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
          <article key={i} className="hover:bg-zinc-950/60 transition">
            <PostRow
              as="div"
              label="Reply"
              meta={`#${i + 1}`}
              body={reply}
              bodyClassName="mt-1 text-sm leading-relaxed whitespace-pre-wrap break-words text-zinc-200"
              actionClassName="mt-3 flex items-center gap-6 text-xs text-zinc-500"
              actions={
                <>
                  <button
                    type="button"
                    onClick={() => setReplyFormAnchor(i)}
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
                </>
              }
            />
            {/* Ask box – under this subtweet when anchor is i */}
            {replyFormAnchor === i && (
              <div className="mt-3 ml-12">
                <form onSubmit={handleAsk} className="flex gap-3">
                  <div className="h-10 w-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-xs text-zinc-400 shrink-0">
                    You
                  </div>
                  <div className="flex-1 min-w-0">
                    <input
                      ref={replyInputRef}
                      type="text"
                      placeholder="Ask a follow-up about this reply…"
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
              </div>
            )}
          </article>
        ))}
      </section>

      {/* Q&A */}
      {followUps.length > 0 && (
        <section ref={qaSectionRef} className="mt-6">
          <h3 className="m-0 text-sm font-semibold text-zinc-400">Q&amp;A</h3>
          <div ref={qaListRef} className="mt-3 space-y-3 max-h-[60vh] overflow-y-auto pr-1">
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
