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

  const threadId = event.queryStringParameters?.threadId ?? event.path?.split('thread-get?threadId=')[1]?.split('&')[0];
  if (!threadId) {
    return jsonResponse({ error: 'Missing threadId' }, 400);
  }

  const supabaseUrl = process.env.SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!supabaseUrl || !supabaseServiceKey) {
    return jsonResponse({ error: 'Server configuration error' }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: thread, error: threadError } = await supabase
    .from('threads')
    .select('id, topic_id, main_post, replies, created_at')
    .eq('id', threadId)
    .single();

  if (threadError || !thread) {
    return jsonResponse({ error: 'Thread not found' }, 404);
  }

  const { data: topic } = await supabase.from('topics').select('id, user_id').eq('id', thread.topic_id).single();
  if (!topic || topic.user_id !== userId) {
    return jsonResponse({ error: 'Forbidden' }, 403);
  }

  const { data: followUps } = await supabase
    .from('follow_ups')
    .select('id, user_question, ai_answer, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  return jsonResponse({
    thread: {
      id: thread.id,
      topic_id: thread.topic_id,
      main_post: thread.main_post,
      replies: thread.replies ?? [],
      created_at: thread.created_at,
    },
    followUps: followUps ?? [],
  });
}
