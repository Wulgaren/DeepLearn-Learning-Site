export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const LOG_PREFIX = "[edge]";
const MAX_PAYLOAD_CHARS = 800;

type LogLevel = "info" | "warn" | "error";

function serializePayload(data: unknown): string {
  if (data === undefined) return "";
  try {
    const s = typeof data === "string" ? data : JSON.stringify(data);
    return s.length <= MAX_PAYLOAD_CHARS ? s : s.slice(0, MAX_PAYLOAD_CHARS) + `... (${s.length} chars)`;
  } catch {
    return String(data).slice(0, MAX_PAYLOAD_CHARS);
  }
}

const MAX_PAYLOAD_CHARS_AI = 1200;

/** Structured log for edge functions. Shows up in Netlify function logs. */
export function log(fn: string, level: LogLevel, message: string, data?: unknown): void {
  const payload = data !== undefined ? serializePayload(data) : "";
  const line = payload ? `${LOG_PREFIX}[${fn}] ${level}: ${message} ${payload}` : `${LOG_PREFIX}[${fn}] ${level}: ${message}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** Log AI request/response for edge. */
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
  if (error !== undefined) {
    log(fn, "error", "AI error", { model, error: error instanceof Error ? error.message : String(error) });
    return;
  }
  const truncated =
    rawResponse != null && rawResponse.length > MAX_PAYLOAD_CHARS_AI
      ? rawResponse.slice(0, MAX_PAYLOAD_CHARS_AI) + `... (${rawResponse.length} chars)`
      : rawResponse ?? "(empty)";
  log(fn, "info", "AI response", { model, usage, raw: truncated });
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateUuid(s: unknown): s is string {
  return typeof s === "string" && UUID_REGEX.test(s);
}

export function sanitizeForPrompt(str: string, maxLen: number): string {
  if (typeof str !== "string" || maxLen < 1) return "";
  let out = str
    .replace(/\r\n|\r|\n/g, " ")
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return out.slice(0, maxLen);
}

export function sanitizeForDb(str: string, maxLen: number): string {
  if (typeof str !== "string" || maxLen < 1) return "";
  const out = str.replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim();
  return out.slice(0, maxLen);
}

const TAG_MAX_LEN = 80;
const TAG_SAFE_REGEX = /^[a-zA-Z0-9\s\-_,.']+$/;

export function sanitizeTag(tag: string): string {
  const t = String(tag).trim().slice(0, TAG_MAX_LEN);
  return TAG_SAFE_REGEX.test(t) ? t : t.replace(/[^a-zA-Z0-9\s\-_,.']/g, "");
}

export const MAX_TAGS_COUNT = 30;

const SESSION_COOKIE_NAME = "session";

/** Read JWT from session cookie (for no-JS form-based auth). */
export function getTokenFromCookie(req: Request): string | null {
  const cookie = req.headers.get("cookie");
  if (!cookie) return null;
  const match = cookie.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
  const token = match?.[1]?.trim();
  return token && token.length > 0 ? token : null;
}

function parseJwtPayload(token: string): { sub?: string } | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}

export function getUserId(req: Request): string | null {
  const auth = req.headers.get("authorization");
  let token: string | null = null;
  if (auth?.startsWith("Bearer ")) {
    token = auth.slice(7);
  } else {
    token = getTokenFromCookie(req);
  }
  if (!token) return null;
  const payload = parseJwtPayload(token);
  return payload?.sub ?? null;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
