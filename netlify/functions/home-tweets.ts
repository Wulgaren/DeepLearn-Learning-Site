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

const MAX_TWEETS = 10;
const MAX_ALREADY_COVERED_IN_PROMPT = 30;

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

  const supabaseUrl = process.env.SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const groqApiKey = process.env.GROQ_API_KEY!;
  if (!supabaseUrl || !supabaseServiceKey || !groqApiKey) {
    return jsonResponse({ error: 'Server configuration error' }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: interestsRow, error: interestsError } = await supabase
    .from('user_interests')
    .select('tags')
    .eq('user_id', userId)
    .maybeSingle();

  if (interestsError) {
    console.error('Interests fetch error:', interestsError);
    return jsonResponse({ error: 'Failed to load interests' }, 500);
  }

  const interests = Array.isArray(interestsRow?.tags) ? interestsRow.tags : [];
  if (interests.length === 0) {
    return jsonResponse({ tweets: [] });
  }

  const { data: homeTopic } = await supabase
    .from('topics')
    .select('id')
    .eq('user_id', userId)
    .eq('query', 'Home')
    .limit(1)
    .maybeSingle();

  const threadMainPosts: string[] = [];
  if (homeTopic) {
    const { data: threads } = await supabase
      .from('threads')
      .select('main_post')
      .eq('topic_id', homeTopic.id);
    if (threads?.length) {
      threads.forEach((t) => {
        if (typeof t.main_post === 'string' && t.main_post.trim()) threadMainPosts.push(t.main_post.trim());
      });
    }
  }

  const { data: suggestionsRow } = await supabase
    .from('user_home_suggestions')
    .select('suggestions')
    .eq('user_id', userId)
    .maybeSingle();

  const storedSuggestions = Array.isArray(suggestionsRow?.suggestions) ? suggestionsRow.suggestions : [];
  const alreadyCovered = Array.from(
    new Set([...threadMainPosts, ...storedSuggestions].filter(Boolean))
  ).slice(0, MAX_ALREADY_COVERED_IN_PROMPT);

  const interestsList = interests.join(', ');
  const alreadyCoveredBlock =
    alreadyCovered.length > 0
      ? `\n\nIMPORTANT: The user has already been shown or has opened threads for these topics. Do NOT suggest anything similar or duplicate. Generate only NEW, different ideas:\n${alreadyCovered.map((s) => `- ${s.replace(/\n/g, ' ').slice(0, 200)}`).join('\n')}\n`
      : '';

  const groq = new Groq({ apiKey: groqApiKey });
  const prompt = `The user is interested in: ${interestsList}.${alreadyCoveredBlock}

Generate between 5 and ${MAX_TWEETS} short "tweet" ideas that would make this reader want to click and learn more. Each tweet should be an engaging, educational hook (1–2 sentences, under 280 characters). Base ideas on real, factual topics—real concepts, real history, real science, real people or works. Do not invent or speculate. Mix angles: surprising facts, how-to hooks, "why X matters", or intriguing questions.

Return ONLY a JSON array of strings, nothing else. No markdown, no code fences, no explanation. Example format:
["First tweet text here.","Second tweet here.",...]

Rules: Use single quotes inside strings if needed; avoid unescaped double quotes inside the tweet text. No trailing comma.`;

  let raw: string;
  try {
    const completion = await groq.chat.completions.create({
      model: 'openai/gpt-oss-120b',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8,
      max_tokens: 2048,
    });
    raw = completion.choices[0]?.message?.content?.trim() ?? '';
  } catch (err) {
    console.error('Groq error:', err);
    return jsonResponse({ error: 'AI service error' }, 502);
  }

  function parseTweets(text: string): string[] {
    let cleaned = text.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```\s*$/i, '').trim();
    const firstBracket = cleaned.indexOf('[');
    const lastBracket = cleaned.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      cleaned = cleaned.slice(firstBracket, lastBracket + 1);
    }
    cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
    try {
      const arr = JSON.parse(cleaned);
      return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string').slice(0, MAX_TWEETS) : [];
    } catch {
      try {
        const repaired = jsonrepair(cleaned);
        const arr = JSON.parse(repaired);
        return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string').slice(0, MAX_TWEETS) : [];
      } catch {
        return [];
      }
    }
  }

  const newTweets = parseTweets(raw);
  const merged = Array.from(new Set([...storedSuggestions, ...newTweets].filter(Boolean)));

  const { error: upsertError } = await supabase.from('user_home_suggestions').upsert(
    { user_id: userId, suggestions: merged },
    { onConflict: 'user_id' }
  );

  if (upsertError) {
    console.error('Home suggestions upsert error:', upsertError);
    return jsonResponse({ error: 'Failed to save suggestions' }, 500);
  }

  return jsonResponse({ tweets: merged });
}
