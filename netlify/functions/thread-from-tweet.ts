import type { HandlerEvent, HandlerResponse } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import Groq from 'groq-sdk';
import { jsonrepair } from 'jsonrepair';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

const REPLIES_COUNT = 5;

export async function handler(event: HandlerEvent): Promise<HandlerResponse> {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const userId = getUserId(event);
  if (!userId) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  let body: { tweet?: string };
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }
  const tweet = typeof body.tweet === 'string' ? body.tweet.trim() : '';
  if (!tweet) {
    return jsonResponse({ error: 'Missing or empty tweet' }, 400);
  }

  const supabaseUrl = process.env.SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const groqApiKey = process.env.GROQ_API_KEY!;
  if (!supabaseUrl || !supabaseServiceKey || !groqApiKey) {
    return jsonResponse({ error: 'Server configuration error' }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: topicRow, error: topicError } = await supabase
    .from('topics')
    .insert({ user_id: userId, query: 'Home' })
    .select('id')
    .single();

  if (topicError || !topicRow) {
    console.error('Topic insert error:', topicError);
    return jsonResponse({ error: 'Failed to create topic' }, 500);
  }

  const { data: threadRow, error: threadError } = await supabase
    .from('threads')
    .insert({ topic_id: topicRow.id, main_post: tweet, replies: [] })
    .select('id')
    .single();

  if (threadError || !threadRow) {
    console.error('Thread insert error:', threadError);
    return jsonResponse({ error: 'Failed to create thread' }, 500);
  }

  const groq = new Groq({ apiKey: groqApiKey });
  const prompt = `You are an expert educator. This is a single "tweet" (main post) that a reader clicked on. Generate exactly ${REPLIES_COUNT} reply posts that expand on it in a thread. Be substantive and informative. Include concrete examples where they fit. Each reply 1–4 sentences, up to ~400 characters. Conversational, flowing sentences—no bullet lists.

Main post: "${tweet.replace(/"/g, "'")}"

Return ONLY valid JSON, no markdown, in this exact shape:
{"replies":["...","...","...","...","..."]}

Rules: One JSON object only. No code fences. No newlines inside strings. Use single quotes for any quoted text inside a reply. No trailing commas.`;

  let raw: string;
  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 2048,
    });
    raw = completion.choices[0]?.message?.content?.trim() ?? '';
  } catch (err) {
    console.error('Groq error:', err);
    return jsonResponse({ error: 'AI service error' }, 502);
  }

  function parseReplies(text: string): string[] {
    let cleaned = text.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```\s*$/i, '').trim();
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }
    cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
    try {
      const parsed = JSON.parse(cleaned) as { replies?: unknown };
      const arr = Array.isArray(parsed?.replies) ? parsed.replies : [];
      return arr.filter((x): x is string => typeof x === 'string').slice(0, REPLIES_COUNT);
    } catch {
      try {
        const repaired = jsonrepair(cleaned);
        const parsed = JSON.parse(repaired) as { replies?: unknown };
        const arr = Array.isArray(parsed?.replies) ? parsed.replies : [];
        return arr.filter((x): x is string => typeof x === 'string').slice(0, REPLIES_COUNT);
      } catch {
        return [];
      }
    }
  }

  const replies = parseReplies(raw);
  const { error: updateError } = await supabase
    .from('threads')
    .update({ replies })
    .eq('id', threadRow.id);

  if (updateError) {
    console.error('Thread update error:', updateError);
    return jsonResponse({ error: 'Failed to save replies' }, 500);
  }

  return jsonResponse({ threadId: threadRow.id });
}
