import { useState, useRef, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getThread, askThread } from '../lib/api';
import { getErrorMessage } from '../lib/errors';
import { useCopyLink } from '../hooks/useCopyLink';
import CopyLinkToast from '../components/CopyLinkToast';
import PostRow from '../components/PostRow';
import type { ThreadReplyItem } from '../types';

export default function Thread() {
  const { threadId } = useParams<{ threadId: string }>();
  const [question, setQuestion] = useState('');
  /** null = form under main post; number = form under that reply index */
  const [replyFormAnchor, setReplyFormAnchor] = useState<number | null>(null);
  const mainInputRef = useRef<HTMLInputElement>(null);
  const replyInputRef = useRef<HTMLInputElement>(null);
  const scrollTargetRef = useRef<HTMLElement>(null);
  const [scrollToReplyIndex, setScrollToReplyIndex] = useState<number | null>(null);

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
    mutationFn: ({
      q,
      replyContext,
      replyIndex,
    }: {
      q: string;
      replyContext?: string;
      replyIndex: number | null;
    }) => askThread(threadId!, q, { replyContext, replyIndex }),
    onSuccess: (result, { q, replyIndex }) => {
      const prev = queryClient.getQueryData<typeof data>(['thread', threadId]);
      const replies = prev?.thread?.replies ?? [];
      const insertAt = replyIndex === null ? replies.length : replyIndex + 1;
      queryClient.setQueryData(['thread', threadId], (prevData: typeof data) => {
        if (!prevData?.thread) return prevData;
        const prevReplies = prevData.thread.replies ?? [];
        const newReplies: ThreadReplyItem[] = [
          ...prevReplies.slice(0, insertAt),
          { type: 'user', content: q },
          { type: 'ai', content: result.answer },
          ...prevReplies.slice(insertAt),
        ];
        return { thread: { ...prevData.thread, replies: newReplies } };
      });
      setQuestion('');
      setReplyFormAnchor(null);
      setScrollToReplyIndex(insertAt);
    },
  });

  // Scroll to the new reply (user question) after it’s in the DOM
  useEffect(() => {
    if (scrollToReplyIndex === null) return;
    const el = scrollTargetRef.current;
    if (el) {
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
    setScrollToReplyIndex(null);
  }, [scrollToReplyIndex]);

  const error =
    (threadError != null ? getErrorMessage(threadError) : undefined) ??
    (askMutation.error != null ? getErrorMessage(askMutation.error) : undefined);

  function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!threadId || !q || askMutation.isPending) return;
    const anchorReply = replyFormAnchor !== null ? replies[replyFormAnchor] : undefined;
    const replyContext: string | undefined =
      anchorReply != null
        ? typeof anchorReply === 'string'
          ? anchorReply
          : anchorReply.content
        : undefined;
    askMutation.mutate({ q, replyContext, replyIndex: replyFormAnchor });
  }

  function handleShare() {
    if (!threadId) return;
    void copyLink(threadId);
  }

  if (loading) return <p className="py-4 text-zinc-500">Loading thread…</p>;
  if (threadError && !data) return <p className="py-4 text-red-400">{error}</p>;
  if (!data) return null;

  const { thread } = data;
  const replies: ThreadReplyItem[] = Array.isArray(thread.replies) ? thread.replies : [];

  return (
    <div className="pb-16">
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
        <section className="px-1 py-4 pb-8 border-b border-zinc-800/80">
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
                maxLength={2000}
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

      {/* Replies: original thread replies (Reply #n) and inline Q&A (You / AI) indented under the tweet they reply to */}
      <section className="divide-y divide-zinc-800/80">
        {replies.map((reply, i) => {
          const isTyped = typeof reply === 'object' && reply !== null && 'type' in reply && 'content' in reply;
          const body: string = isTyped
            ? String((reply as { type: string; content: string }).content ?? '')
            : String(reply);
          const label = isTyped
            ? (reply as { type: string }).type === 'user'
              ? 'You'
              : 'AI'
            : 'Reply';
          const meta = isTyped ? undefined : `#${i + 1}`;
          const isReplyToTweet = isTyped;
          return (
          <article
            key={i}
            ref={scrollToReplyIndex === i ? scrollTargetRef : undefined}
            className={`hover:bg-zinc-950/60 transition ${isReplyToTweet ? 'pl-10 md:pl-12 border-l-2 border-zinc-800/80 ml-2' : ''}`}
          >
            <PostRow
              as="div"
              label={label}
              meta={meta}
              body={body}
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
              <div className="mt-3 ml-10 md:ml-12">
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
                      maxLength={2000}
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
          );
        })}
      </section>
    </div>
  );
}
