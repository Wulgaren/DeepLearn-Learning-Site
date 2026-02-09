import type {
  GenerateFeedResponse,
  GetFeedResponse,
  GetThreadResponse,
  AskThreadResponse,
  ThreadSummary,
} from '../types';

const API_BASE = ''; // all API routes are edge at /api/*
const AI_RETRY_DELAY_MS = 1000;

/** Run an AI-backed request; on failure wait once then retry one time before throwing. */
async function withOneRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    await new Promise((r) => setTimeout(r, AI_RETRY_DELAY_MS));
    return await fn();
  }
}

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
  const text = await res.text();
  if (!res.ok) {
    let message = 'Request failed';
    try {
      const data = text ? (JSON.parse(text) as { error?: string }) : {};
      message = data.error ?? message;
    } catch {
      // non-JSON error body (e.g. HTML)
    }
    throw new Error(message);
  }
  try {
    return (text ? JSON.parse(text) : {}) as T;
  } catch {
    throw new Error('Invalid response');
  }
}

export async function generateFeed(topic: string): Promise<GenerateFeedResponse> {
  return withOneRetry(() =>
    apiFetch<GenerateFeedResponse>(`${API_BASE}/api/feed-generate`, {
      method: 'POST',
      body: JSON.stringify({ topic }),
    })
  );
}

export async function getFeed(): Promise<GetFeedResponse> {
  return apiFetch<GetFeedResponse>(`${API_BASE}/api/feed`);
}

export async function getThread(threadId: string): Promise<GetThreadResponse> {
  return apiFetch<GetThreadResponse>(
    `${API_BASE}/api/thread-get?threadId=${encodeURIComponent(threadId)}`
  );
}

export async function askThread(
  threadId: string,
  question: string,
  options?: { replyContext?: string; replyIndex?: number | null }
): Promise<AskThreadResponse> {
  return withOneRetry(() =>
    apiFetch<AskThreadResponse>(`${API_BASE}/api/thread-ask`, {
      method: 'POST',
      body: JSON.stringify({
        threadId,
        question,
        replyContext: options?.replyContext || undefined,
        replyIndex: options?.replyIndex ?? null,
      }),
    })
  );
}

export async function getInterests(): Promise<{ tags: string[] }> {
  return apiFetch<{ tags: string[] }>(`${API_BASE}/api/interests`);
}

export async function setInterests(tags: string[]): Promise<void> {
  await apiFetch<void>(`${API_BASE}/api/interests`, {
    method: 'POST',
    body: JSON.stringify({ tags }),
  });
}

export async function getHomeTweets(): Promise<{ tweets: string[] }> {
  return apiFetch<{ tweets: string[] }>(`${API_BASE}/api/home-tweets`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function createThreadFromTweet(tweet: string): Promise<{ threadId: string }> {
  return withOneRetry(() =>
    apiFetch<{ threadId: string }>(`${API_BASE}/api/thread-from-tweet`, {
      method: 'POST',
      body: JSON.stringify({ tweet }),
    })
  );
}

export async function getHomeThreads(): Promise<{ threads: ThreadSummary[] }> {
  return apiFetch<{ threads: ThreadSummary[] }>(`${API_BASE}/api/home-threads`);
}
