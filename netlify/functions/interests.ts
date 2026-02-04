import type { HandlerEvent, HandlerResponse } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
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

  if (event.httpMethod === 'GET') {
    const { data: row, error } = await supabase
      .from('user_interests')
      .select('tags')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Interests get error:', error);
      return jsonResponse({ error: 'Failed to load interests' }, 500);
    }
    const tags = Array.isArray(row?.tags) ? row.tags : [];
    return jsonResponse({ tags });
  }

  // POST: upsert tags
  let body: { tags?: unknown };
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }
  const raw = body.tags;
  const tags = Array.isArray(raw)
    ? raw.filter((t): t is string => typeof t === 'string').map((t) => String(t).trim()).filter(Boolean)
    : [];

  const { error: upsertError } = await supabase.from('user_interests').upsert(
    { user_id: userId, tags },
    { onConflict: 'user_id' }
  );

  if (upsertError) {
    console.error('Interests upsert error:', upsertError);
    return jsonResponse({ error: 'Failed to save interests' }, 500);
  }

  return jsonResponse({ tags });
}
