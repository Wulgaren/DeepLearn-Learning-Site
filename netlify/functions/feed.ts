import type { HandlerEvent, HandlerResponse } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function jsonResponse(body: unknown, status = 200): HandlerResponse {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
    body: JSON.stringify(body),
  };
}

function getUserId(event: HandlerEvent): string | null {
  const auth = event.headers['authorization'] || event.headers['Authorization'];
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

export async function handler(event: HandlerEvent): Promise<HandlerResponse> {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const userId = getUserId(event);
  if (!userId) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const supabaseUrl = process.env.SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!supabaseUrl || !supabaseServiceKey) {
    return jsonResponse({ error: 'Server configuration error' }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: topics, error: topicsError } = await supabase
    .from('topics')
    .select('id, query, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (topicsError) {
    console.error('Topics error:', topicsError);
    return jsonResponse({ error: 'Failed to load feed' }, 500);
  }

  if (!topics?.length) {
    return jsonResponse({ topics: [], threadsByTopic: {} });
  }

  const topicIds = topics.map((t) => t.id);
  const { data: threads, error: threadsError } = await supabase
    .from('threads')
    .select('id, topic_id, main_post, replies, created_at')
    .in('topic_id', topicIds)
    .order('created_at', { ascending: true });

  if (threadsError) {
    console.error('Threads error:', threadsError);
    return jsonResponse({ error: 'Failed to load threads' }, 500);
  }

  const threadsByTopic: Record<string, Array<{ id: string; main_post: string; replies: string[]; created_at: string }>> = {};
  for (const tid of topicIds) threadsByTopic[tid] = [];
  for (const t of threads || []) {
    const list = threadsByTopic[t.topic_id];
    if (list) list.push({ id: t.id, main_post: t.main_post, replies: t.replies ?? [], created_at: t.created_at });
  }

  return jsonResponse({
    topics: topics.map((t) => ({ id: t.id, query: t.query, created_at: t.created_at })),
    threadsByTopic,
  });
}
