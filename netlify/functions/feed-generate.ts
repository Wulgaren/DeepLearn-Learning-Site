import type { HandlerEvent, HandlerResponse } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import Groq from 'groq-sdk';

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

const THREADS_COUNT = 6;
const REPLIES_PER_THREAD = 4;

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

  let body: { topic?: string };
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }
  const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
  if (!topic) {
    return jsonResponse({ error: 'Missing or empty topic' }, 400);
  }

  const supabaseUrl = process.env.SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const groqApiKey = process.env.GROQ_API_KEY!;
  if (!supabaseUrl || !supabaseServiceKey || !groqApiKey) {
    return jsonResponse({ error: 'Server configuration error' }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const groq = new Groq({ apiKey: groqApiKey });

  const prompt = `You are a helpful educator. Generate exactly ${THREADS_COUNT} Twitter-style threads about the topic: "${topic}".

Each thread has one main tweet (a hook or key idea) and ${REPLIES_PER_THREAD} reply tweets that expand on it in a casual, informative style.
Return ONLY valid JSON, no markdown or explanation, in this exact shape:
{"threads":[{"main":"...","replies":["...","...","...","..."]},{"main":"...","replies":["...","...","...","..."]}, ...]}

Use short, punchy tweet-style text (under 280 characters per tweet). Make the content educational and engaging.`;

  let raw: string;
  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    });
    raw = completion.choices[0]?.message?.content?.trim() ?? '';
  } catch (err) {
    console.error('Groq error:', err);
    return jsonResponse({ error: 'AI service error' }, 502);
  }

  let parsed: { threads?: Array<{ main?: string; replies?: string[] }> };
  try {
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return jsonResponse({ error: 'Invalid AI response format' }, 502);
  }

  const threads = Array.isArray(parsed.threads) ? parsed.threads : [];
  if (threads.length === 0) {
    return jsonResponse({ error: 'No threads generated' }, 502);
  }

  const { data: topicRow, error: topicError } = await supabase
    .from('topics')
    .insert({ user_id: userId, query: topic })
    .select('id')
    .single();

  if (topicError || !topicRow) {
    console.error('Topic insert error:', topicError);
    return jsonResponse({ error: 'Failed to save topic' }, 500);
  }

  const threadRows = threads.slice(0, THREADS_COUNT).map((t) => ({
    topic_id: topicRow.id,
    main_post: typeof t.main === 'string' ? t.main : 'No content',
    replies: Array.isArray(t.replies) ? t.replies : [],
  }));

  const { data: insertedThreads, error: threadsError } = await supabase
    .from('threads')
    .insert(threadRows)
    .select('id, main_post, replies, created_at');

  if (threadsError || !insertedThreads?.length) {
    console.error('Threads insert error:', threadsError);
    return jsonResponse({ error: 'Failed to save threads' }, 500);
  }

  return jsonResponse({
    topicId: topicRow.id,
    threadIds: insertedThreads.map((t) => t.id),
    threads: insertedThreads,
  });
}
