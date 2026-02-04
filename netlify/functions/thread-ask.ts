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

  let body: { threadId?: string; question?: string };
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }
  const threadId = body.threadId;
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!threadId || !question) {
    return jsonResponse({ error: 'Missing threadId or question' }, 400);
  }

  const supabaseUrl = process.env.SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const groqApiKey = process.env.GROQ_API_KEY!;
  if (!supabaseUrl || !supabaseServiceKey || !groqApiKey) {
    return jsonResponse({ error: 'Server configuration error' }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: thread, error: threadError } = await supabase
    .from('threads')
    .select('id, topic_id, main_post, replies')
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
    .select('user_question, ai_answer')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  const replies = (thread.replies ?? []) as string[];
  const context = [
    'Thread (main): ' + thread.main_post,
    ...replies.map((r, i) => `Reply ${i + 1}: ${r}`),
    ...(followUps ?? []).flatMap((f) => [`Q: ${f.user_question}`, `A: ${f.ai_answer}`]),
  ].join('\n');

  const groq = new Groq({ apiKey: groqApiKey });
  const prompt = `You are an informative, friendly tutor. Given this thread and any previous Q&A:

${context}

User asks: ${question}

Reply in 1–4 clear sentences. Be helpful and conversational. Only state factual, verifiable information—use real examples, real names, real studies. Do not invent or speculate; if unsure, say so. No JSON, no quotes—just the reply text.`;

  let answer: string;
  try {
    const completion = await groq.chat.completions.create({
      model: 'openai/gpt-oss-120b',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.6,
      max_tokens: 400,
    });
    answer = (completion.choices[0]?.message?.content ?? '').trim();
  } catch (err) {
    console.error('Groq error:', err);
    return jsonResponse({ error: 'AI service error' }, 502);
  }

  const { data: inserted, error: insertError } = await supabase
    .from('follow_ups')
    .insert({ thread_id: threadId, user_question: question, ai_answer: answer })
    .select('id, user_question, ai_answer, created_at')
    .single();

  if (insertError || !inserted) {
    console.error('Follow-up insert error:', insertError);
    return jsonResponse({ error: 'Failed to save answer' }, 500);
  }

  return jsonResponse({ answer, followUp: inserted });
}
