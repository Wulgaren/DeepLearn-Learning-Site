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
    const useWeb = text.startsWith('YES');
    log('classifier', 'info', 'needsWebGrounding', { model: CLASSIFIER_MODEL, response: text.slice(0, 20), useWeb });
    return useWeb;
  } catch (err) {
    log('classifier', 'warn', 'Classification failed, defaulting to no web', { error: err instanceof Error ? err.message : String(err) });
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

const SESSION_COOKIE_NAME = 'session';

/** Read JWT from session cookie (for no-JS form-based auth). */
export function getTokenFromCookie(event: HandlerEvent): string | null {
  const cookie = event.headers['cookie'] || event.headers['Cookie'];
  if (!cookie || typeof cookie !== 'string') return null;
  const match = cookie.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
  const token = match?.[1]?.trim();
  return token && token.length > 0 ? token : null;
}

function parseJwtPayload(token: string): { sub?: string } | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

export function getUserId(event: HandlerEvent): string | null {
  const auth = event.headers['authorization'] || event.headers['Authorization'];
  let token: string | null = null;
  if (auth?.startsWith('Bearer ')) {
    token = auth.slice(7);
  } else {
    token = getTokenFromCookie(event);
  }
  if (!token) return null;
  const payload = parseJwtPayload(token);
  return payload?.sub ?? null;
}

export function jsonResponse(body: unknown, status = 200): HandlerResponse {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
    body: JSON.stringify(body),
  };
}

// --- Logging (Netlify function logs) ---
const LOG_PREFIX = '[fn]';
const MAX_PAYLOAD_CHARS = 1200;

type LogLevel = 'info' | 'warn' | 'error';

function serializePayload(data: unknown): string {
  if (data === undefined) return '';
  try {
    const s = typeof data === 'string' ? data : JSON.stringify(data);
    return s.length <= MAX_PAYLOAD_CHARS ? s : s.slice(0, MAX_PAYLOAD_CHARS) + `... (${s.length} chars)`;
  } catch {
    return String(data).slice(0, MAX_PAYLOAD_CHARS);
  }
}

/** Structured log for serverless functions. */
export function log(fn: string, level: LogLevel, message: string, data?: unknown): void {
  const payload = data !== undefined ? serializePayload(data) : '';
  const line = payload ? `${LOG_PREFIX}[${fn}] ${level}: ${message} ${payload}` : `${LOG_PREFIX}[${fn}] ${level}: ${message}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

/** Log AI request/response: model, truncated raw response, usage, or error. */
export function logAi(
  fn: string,
  opts: {
    model: string;
    rawResponse?: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    error?: unknown;
  }
): void {
  const { model, rawResponse, usage, error } = opts;
  const parts: string[] = [`model=${model}`];
  if (usage?.prompt_tokens != null) parts.push(`prompt_tokens=${usage.prompt_tokens}`);
  if (usage?.completion_tokens != null) parts.push(`completion_tokens=${usage.completion_tokens}`);
  if (error !== undefined) {
    log(fn, 'error', 'AI error', { model, error: error instanceof Error ? error.message : String(error) });
    return;
  }
  const truncated = rawResponse
    ? rawResponse.length <= MAX_PAYLOAD_CHARS
      ? rawResponse
      : rawResponse.slice(0, MAX_PAYLOAD_CHARS) + `... (${rawResponse.length} chars)`
    : '(empty)';
  log(fn, 'info', 'AI response', { model, ...(parts.length > 1 ? { usage: parts.slice(1).join(', ') } : {}), raw: truncated });
}
