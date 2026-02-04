const BASE = '/.netlify/functions';
const EDGE_BASE = ''; // edge functions at /api/*

async function getAuthHeaders(): Promise<HeadersInit> {
  const { supabase } = await import('./supabase');
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
  return headers;
}

export async function generateFeed(topic: string): Promise<{
  topicId: string;
  threadIds: string[];
  threads: Array<{ id: string; main_post: string; replies: string[]; created_at: string }>;
}> {
  const res = await fetch(`${BASE}/feed-generate`, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ topic }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Failed to generate');
  return data;
}

export async function getFeed(): Promise<{
  topics: Array<{ id: string; query: string; created_at: string }>;
  threadsByTopic: Record<string, Array<{ id: string; main_post: string; replies: string[]; created_at: string }>>;
}> {
  const res = await fetch(`${EDGE_BASE}/api/feed`, { headers: await getAuthHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Failed to load feed');
  return data;
}

export async function getThread(threadId: string): Promise<{
  thread: { id: string; topic_id: string; main_post: string; replies: string[]; created_at: string };
  followUps: Array<{ id: string; user_question: string; ai_answer: string; created_at: string }>;
}> {
  const res = await fetch(`${EDGE_BASE}/api/thread-get?threadId=${encodeURIComponent(threadId)}`, {
    headers: await getAuthHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Failed to load thread');
  return data;
}

export async function askThread(threadId: string, question: string): Promise<{
  answer: string;
  followUp: { id: string; user_question: string; ai_answer: string; created_at: string };
}> {
  const res = await fetch(`${BASE}/thread-ask`, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ threadId, question }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Failed to get answer');
  return data;
}

export async function getInterests(): Promise<{ tags: string[] }> {
  const res = await fetch(`${EDGE_BASE}/api/interests`, { headers: await getAuthHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Failed to load interests');
  return data;
}

export async function setInterests(tags: string[]): Promise<void> {
  const res = await fetch(`${EDGE_BASE}/api/interests`, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ tags }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Failed to save interests');
}

export async function getHomeTweets(): Promise<{ tweets: string[] }> {
  const res = await fetch(`${BASE}/home-tweets`, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Failed to load tweets');
  return data;
}

export async function createThreadFromTweet(tweet: string): Promise<{ threadId: string }> {
  const res = await fetch(`${BASE}/thread-from-tweet`, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ tweet }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Failed to create thread');
  return data;
}

export async function getHomeThreads(): Promise<{
  threads: Array<{ id: string; main_post: string; replies: string[]; created_at: string }>;
}> {
  const res = await fetch(`${EDGE_BASE}/api/home-threads`, { headers: await getAuthHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Failed to load home threads');
  return data;
}
