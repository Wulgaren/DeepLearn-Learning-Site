import type {
  GenerateFeedResponse,
  GetFeedResponse,
  GetThreadResponse,
  AskThreadResponse,
  ThreadSummary,
} from '../types';

const EDGE_BASE = ''; // edge functions at /api/*

async function getAuthHeaders(): Promise<HeadersInit> {
  const { supabase } = await import('./supabase');
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
  return headers;
}

async function apiFetch<T>(
  url: string,
  options: { method?: string; body?: string } = {}
): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(url, {
    method: options.method,
    body: options.body,
    headers: headers as Record<string, string>,
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Request failed');
  return data as T;
}

export async function generateFeed(topic: string): Promise<GenerateFeedResponse> {
  return apiFetch<GenerateFeedResponse>(`${EDGE_BASE}/api/feed-generate`, {
    method: 'POST',
    body: JSON.stringify({ topic }),
  });
}

export async function getFeed(): Promise<GetFeedResponse> {
  return apiFetch<GetFeedResponse>(`${EDGE_BASE}/api/feed`);
}

export async function getThread(threadId: string): Promise<GetThreadResponse> {
  return apiFetch<GetThreadResponse>(
    `${EDGE_BASE}/api/thread-get?threadId=${encodeURIComponent(threadId)}`
  );
}

export async function askThread(
  threadId: string,
  question: string,
  options?: { replyContext?: string; replyIndex?: number | null }
): Promise<AskThreadResponse> {
  return apiFetch<AskThreadResponse>(`${EDGE_BASE}/api/thread-ask`, {
    method: 'POST',
    body: JSON.stringify({
      threadId,
      question,
      replyContext: options?.replyContext || undefined,
      replyIndex: options?.replyIndex ?? null,
    }),
  });
}

export async function getInterests(): Promise<{ tags: string[] }> {
  return apiFetch<{ tags: string[] }>(`${EDGE_BASE}/api/interests`);
}

export async function setInterests(tags: string[]): Promise<void> {
  await apiFetch<void>(`${EDGE_BASE}/api/interests`, {
    method: 'POST',
    body: JSON.stringify({ tags }),
  });
}

export async function getHomeTweets(): Promise<{ tweets: string[] }> {
  return apiFetch<{ tweets: string[] }>(`${EDGE_BASE}/api/home-tweets`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function createThreadFromTweet(tweet: string): Promise<{ threadId: string }> {
  return apiFetch<{ threadId: string }>(`${EDGE_BASE}/api/thread-from-tweet`, {
    method: 'POST',
    body: JSON.stringify({ tweet }),
  });
}

export async function getHomeThreads(): Promise<{ threads: ThreadSummary[] }> {
  return apiFetch<{ threads: ThreadSummary[] }>(`${EDGE_BASE}/api/home-threads`);
}
