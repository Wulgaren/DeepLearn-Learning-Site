import type { Config, Context } from "@netlify/edge-functions";
import { corsHeaders, getTokenFromCookie, jsonResponse } from "./lib/shared.ts";

const SESSION_COOKIE_NAME = "session";
const SESSION_REFRESH_COOKIE_NAME = "session_refresh";
const COOKIE_OPTS = "HttpOnly; Path=/; SameSite=Lax";
const COOKIE_SECURE = "Secure; ";

function getRefreshFromCookie(req: Request): string | null {
  const cookie = req.headers.get("cookie");
  if (!cookie) return null;
  const match = cookie.match(new RegExp(`${SESSION_REFRESH_COOKIE_NAME}=([^;]+)`));
  const v = match?.[1]?.trim();
  return v && v.length > 0 ? v : null;
}

/**
 * GET: Return current session tokens from cookies so the SPA can restore into Supabase client (localStorage).
 * POST: Set session cookies from SPA login so reload and no-JS paths see the user as logged in.
 */
export default async function handler(req: Request, _context: Context): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const isHttps = url.protocol === "https:";

  if (req.method === "GET") {
    const accessToken = getTokenFromCookie(req) ?? (req.headers.get("authorization")?.startsWith("Bearer ") ? req.headers.get("authorization")!.slice(7) : null);
    if (!accessToken) {
      return jsonResponse({ error: "No session" }, 401);
    }
    const refreshToken = getRefreshFromCookie(req);
    return jsonResponse({ access_token: accessToken, refresh_token: refreshToken ?? "" });
  }

  if (req.method === "POST") {
    let body: { access_token?: string; refresh_token?: string };
    try {
      body = req.body ? await req.json() : {};
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400);
    }
    const accessToken = typeof body.access_token === "string" ? body.access_token.trim() : "";
    if (!accessToken) {
      return jsonResponse({ error: "Missing access_token" }, 400);
    }
    const refreshToken = typeof body.refresh_token === "string" ? body.refresh_token.trim() : "";
    const headers = new Headers({
      "Content-Type": "application/json",
      ...corsHeaders,
    });
    headers.append(
      "Set-Cookie",
      `${SESSION_COOKIE_NAME}=${accessToken}; ${isHttps ? COOKIE_SECURE : ""}${COOKIE_OPTS}`
    );
    if (refreshToken) {
      headers.append(
        "Set-Cookie",
        `${SESSION_REFRESH_COOKIE_NAME}=${refreshToken}; ${isHttps ? COOKIE_SECURE : ""}${COOKIE_OPTS}`
      );
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
}

export const config: Config = {
  path: "/api/session",
};
