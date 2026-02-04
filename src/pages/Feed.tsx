import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getFeed, generateFeed } from '../lib/api';
import { getErrorMessage } from '../lib/errors';
import { useCopyLink } from '../hooks/useCopyLink';
import CopyLinkToast from '../components/CopyLinkToast';
import PostRow from '../components/PostRow';
import type { FeedTopic, ThreadSummary } from '../types';

export default function Feed() {
  const [topicInput, setTopicInput] = useState('');
  const { copyLink, linkCopied } = useCopyLink();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();

  const { data, isLoading: loading, error: feedError } = useQuery({
    queryKey: ['feed'],
    queryFn: getFeed,
  });
  const topics = data?.topics ?? [];
  const threadsByTopic = data?.threadsByTopic ?? {};

  const generateMutation = useMutation({
    mutationFn: ({ topic }: { topic: string }) => generateFeed(topic),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      setTopicInput('');
    },
  });

  const handledTopicFromNav = useRef<string | null>(null);
  useEffect(() => {
    const topicFromNav = (location.state as { topic?: string } | null)?.topic?.trim() ?? null;
    if (!topicFromNav) {
      handledTopicFromNav.current = null;
      return;
    }
    if (topicFromNav === handledTopicFromNav.current) return;
    handledTopicFromNav.current = topicFromNav;
    generateMutation.mutate({ topic: topicFromNav });
    navigate(location.pathname, { replace: true, state: {} });
    // generateMutation omitted to avoid effect running on every mutation state change
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run when location.state has topic
  }, [location.state, location.pathname, navigate]);

  const error = feedError != null ? getErrorMessage(feedError) : undefined;

  function handleShare(e: React.MouseEvent, threadId: string) {
    e.preventDefault();
    e.stopPropagation();
    void copyLink(threadId);
  }

  function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    const topic = topicInput.trim();
    if (!topic || generateMutation.isPending) return;
    generateMutation.mutate({ topic });
  }

  return (
    <div className="pb-10">
      <CopyLinkToast show={linkCopied} />
      {/* Composer */}
      <section className="py-4 border-b border-zinc-800/80">
        <form onSubmit={handleGenerate}>
          <div className="flex gap-3">
            <div className="h-10 w-10 rounded-full bg-zinc-800 flex items-center justify-center text-xs text-zinc-300 shrink-0">
              AI
            </div>
            <div className="flex-1">
              <input
                type="text"
                placeholder="What do you want to learn today?"
                value={topicInput}
                onChange={(e) => setTopicInput(e.target.value)}
                disabled={generateMutation.isPending}
                maxLength={500}
                className="w-full bg-transparent text-[1.05rem] placeholder:text-zinc-500 outline-none py-2"
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="m-0 text-xs text-zinc-500">
                  Tip: try "React hooks", "Postgres", "LLMs", "System design"…
                </p>
                <button
                  type="submit"
                  disabled={generateMutation.isPending || !topicInput.trim()}
                  className="px-4 py-2 rounded-full font-semibold bg-zinc-100 text-black hover:bg-white disabled:opacity-50 disabled:hover:bg-zinc-100"
                >
                  {generateMutation.isPending ? 'Generating…' : 'Generate'}
                </button>
              </div>
              {(error || generateMutation.error) && (
                <p className="mt-3 text-red-400 text-sm">
                  {error ?? getErrorMessage(generateMutation.error)}
                </p>
              )}
            </div>
          </div>
        </form>
      </section>

      {/* Feed */}
      <section className="pt-2">
        {loading ? (
          <p className="text-zinc-500 text-sm py-6">Loading…</p>
        ) : topics.length === 0 ? (
          <div className="py-10">
            <p className="m-0 text-zinc-400">
              No topics yet.
            </p>
            <p className="m-0 mt-2 text-sm text-zinc-500">
              Use the composer above to generate your first set of threads.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/80">
            {topics.map((topic: FeedTopic) => (
              <div key={topic.id}>
                <div className="sticky top-[50px] z-[5] bg-black/70 backdrop-blur border-b border-zinc-800/80">
                  <div className="px-1 py-2">
                    <p className="m-0 text-xs text-zinc-500">Topic</p>
                    <h2 className="m-0 text-sm font-semibold text-zinc-200 truncate">{topic.query}</h2>
                  </div>
                </div>

                {(threadsByTopic[topic.id] ?? []).length === 0 ? (
                  <div className="py-6 text-sm text-zinc-500">No threads yet for this topic.</div>
                ) : (
                  <ul className="list-none p-0 m-0">
                    {(threadsByTopic[topic.id] ?? []).map((thread: ThreadSummary) => (
                      <li key={thread.id} className="border-b border-zinc-800/80 last:border-b-0">
                        <PostRow
                          as="link"
                          to={`/thread/${thread.id}`}
                          label="Thread"
                          meta={`${Array.isArray(thread.replies) ? thread.replies.length : 0} replies`}
                          body={thread.main_post}
                          lineClamp={3}
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
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
