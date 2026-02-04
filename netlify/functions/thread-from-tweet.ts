import type { HandlerEvent } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import Groq from 'groq-sdk';
import { jsonrepair } from 'jsonrepair';
import { corsHeaders, getUserId, jsonResponse, sanitizeForPrompt, sanitizeForDb } from './_shared';

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
  const rawTweet = typeof body.tweet === 'string' ? body.tweet.trim() : '';
  const tweet = sanitizeForPrompt(rawTweet, 1000);
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

  let topicRow: { id: string } | null = null;
  const { data: existing } = await supabase
    .from('topics')
    .select('id')
    .eq('user_id', userId)
    .eq('query', 'Home')
    .limit(1)
    .maybeSingle();

  if (existing) {
    topicRow = existing;
  } else {
    const { data: inserted, error: topicError } = await supabase
      .from('topics')
      .insert({ user_id: userId, query: 'Home' })
      .select('id')
      .single();
    if (topicError || !inserted) {
      console.error('Topic insert error:', topicError);
      return jsonResponse({ error: 'Failed to create topic' }, 500);
    }
    topicRow = inserted;
  }

  const mainPostForDb = sanitizeForDb(rawTweet, 1000);
  const { data: threadRow, error: threadError } = await supabase
    .from('threads')
    .insert({ topic_id: topicRow.id, main_post: mainPostForDb, replies: [] })
    .select('id')
    .single();

  if (threadError || !threadRow) {
    console.error('Thread insert error:', threadError);
    return jsonResponse({ error: 'Failed to create thread' }, 500);
  }

  const groq = new Groq({ apiKey: groqApiKey });
  const prompt = `You are an expert educator. This is a single "tweet" (main post) that a reader clicked on. Generate exactly ${REPLIES_COUNT} reply posts that expand on it in a thread. Be factual and accurate: only state true, verifiable information. Use real people, real events, real studies—no invented examples. If something is uncertain, say so. Each reply 1–4 sentences, up to ~400 characters. Conversational, flowing sentences—no bullet lists.

---MAIN POST---
${tweet}
---END MAIN POST---

Return ONLY valid JSON, no markdown, in this exact shape:
{"replies":["...","...","...","...","..."]}

Rules: One JSON object only. No code fences. No newlines inside strings. Use single quotes for any quoted text inside a reply. No trailing commas.`;

  let raw: string;
  try {
    const completion = await groq.chat.completions.create({
      model: 'openai/gpt-oss-120b',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 2048,
    });
    raw = completion.choices[0]?.message?.content?.trim() ?? '';
  } catch (err) {
    console.error('Groq error:', err);
    return jsonResponse({ error: 'AI service error' }, 502);
  }

  if (!raw) {
    console.error('Groq returned empty response for thread-from-tweet');
    return jsonResponse({ error: 'AI returned an empty response. Please try again.' }, 502);
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
  if (replies.length === 0) {
    console.error('Groq response could not be parsed or had no replies');
    return jsonResponse({ error: 'AI could not generate replies. Please try again.' }, 502);
  }

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
