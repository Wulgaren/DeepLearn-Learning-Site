import type { HandlerEvent, HandlerResponse } from '@netlify/functions';
import Groq from 'groq-sdk';

/** Small, fast model used only for YES/NO "needs web grounding?" classification. */
export const CLASSIFIER_MODEL = 'llama-3.1-8b-instant';

/** Groq Compound model with built-in web search; used when classifier says grounding is needed. */
export const GROQ_COMPOUND_MODEL = 'groq/compound';

const CLASSIFIER_MAX_TOKENS = 10;

/**
 * Call the classifier model with the given prompt; returns true if the reply starts with YES.
 * Used to decide whether to use Compound (web search) for the main completion.
 */
export async function classifyNeedsWebGrounding(groq: InstanceType<typeof Groq>, prompt: string): Promise<boolean> {
  try {
    const completion = await groq.chat.completions.create({
      model: CLASSIFIER_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: CLASSIFIER_MAX_TOKENS,
    });
    const text = (completion.choices[0]?.message?.content ?? '').trim().toUpperCase();
    return text.startsWith('YES');
  } catch {
    return false;
  }
}

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Validate UUID (e.g. threadId, topicId) to prevent injection and bad lookups. */
export function validateUuid(s: unknown): s is string {
  return typeof s === 'string' && UUID_REGEX.test(s);
}

/**
 * Sanitize user input before putting it into an AI prompt. Reduces prompt injection risk:
 * strips control chars, normalizes newlines to space, truncates.
 */
export function sanitizeForPrompt(str: string, maxLen: number): string {
  if (typeof str !== 'string' || maxLen < 1) return '';
  let out = str
    .replace(/\r\n|\r|\n/g, ' ')
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return out.slice(0, maxLen);
}

/**
 * Sanitize string before storing in DB: strip control chars, truncate.
 */
export function sanitizeForDb(str: string, maxLen: number): string {
  if (typeof str !== 'string' || maxLen < 1) return '';
  const out = str.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim();
  return out.slice(0, maxLen);
}

/** Max length for a single tag (e.g. interest). Safe chars only. */
const TAG_MAX_LEN = 80;
const TAG_SAFE_REGEX = /^[a-zA-Z0-9\s\-_,.']+$/;

export function sanitizeTag(tag: string): string {
  const t = String(tag).trim().slice(0, TAG_MAX_LEN);
  return TAG_SAFE_REGEX.test(t) ? t : t.replace(/[^a-zA-Z0-9\s\-_,.']/g, '');
}

export const MAX_TAGS_COUNT = 30;

export function getUserId(event: HandlerEvent): string | null {
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

export function jsonResponse(body: unknown, status = 200): HandlerResponse {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
    body: JSON.stringify(body),
  };
}
