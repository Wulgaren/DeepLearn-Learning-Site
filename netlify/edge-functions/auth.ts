import type { Context } from "@netlify/edge-functions";
import { escapeHtml, layoutAuth } from "./lib/html.ts";

const SESSION_COOKIE_NAME = "session";
const COOKIE_OPTS = "HttpOnly; Path=/; SameSite=Lax";
const COOKIE_SECURE = "Secure; ";

function getSupabaseAuthConfig(): { url: string; anonKey: string } | null {
  const url = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("VITE_SUPABASE_ANON_KEY");
  if (url && anonKey) return { url, anonKey };
  return null;
}

function redirect(
  location: string,
  cookie?: { name: string; value: string; clear?: boolean },
  isHttps = false
): Response {
  const headers = new Headers({ Location: location });
  if (cookie) {
    if (cookie.clear) {
      headers.append(
        "Set-Cookie",
        `${cookie.name}=; Path=/; Max-Age=0; ${COOKIE_OPTS}`
      );
    } else {
      headers.append(
        "Set-Cookie",
        `${cookie.name}=${cookie.value}; ${isHttps ? COOKIE_SECURE : ""}${COOKIE_OPTS}`
      );
    }
  }
  return new Response(null, { status: 302, headers });
}

async function parseFormBody(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get("content-type") ?? "";
  const out: Record<string, string> = {};
  if (ct.includes("application/x-www-form-urlencoded")) {
    const text = await req.text();
    for (const part of text.split("&")) {
      const eq = part.indexOf("=");
      const k = eq >= 0 ? decodeURIComponent(part.slice(0, eq).replace(/\+/g, " ")) : decodeURIComponent(part.replace(/\+/g, " "));
      const v = eq >= 0 ? decodeURIComponent(part.slice(eq + 1).replace(/\+/g, " ")) : "";
      if (k) out[k] = v;
    }
  }
  return out;
}

export default async function handler(req: Request, _context: Context): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  const isHttps = url.protocol === "https:";

  // GET /logout — redirect to /login
  if (path === "/logout" && req.method === "GET") {
    return redirect("/login", undefined, isHttps);
  }

  // POST /logout — clear cookie and redirect to /login
  if (path === "/logout" && req.method === "POST") {
    return redirect("/login", { name: SESSION_COOKIE_NAME, value: "", clear: true }, isHttps);
  }

  // GET /login — show form
  if (path === "/login" && req.method === "GET") {
    const error = url.searchParams.get("error");
    const message = url.searchParams.get("message");
    const body = `
    <p class="text-zinc-600 text-sm mb-6 leading-snug">Use your email and password to access your feed on any device.</p>
    <form method="post" action="/login" class="flex flex-col gap-3">
      <input type="email" name="email" placeholder="Email" required autocomplete="email" class="px-4 py-3 rounded-lg border border-zinc-200 bg-white text-zinc-900 text-base placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <input type="password" name="password" placeholder="Password" required autocomplete="current-password" class="px-4 py-3 rounded-lg border border-zinc-200 bg-white text-zinc-900 text-base placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      ${error ? `<p class="text-red-600 text-sm m-0">${escapeHtml(decodeURIComponent(error))}</p>` : ""}
      ${message === "confirm" ? `<p class="text-zinc-600 text-sm m-0">Check your inbox (and spam) for the confirmation link, then log in.</p>` : ""}
      <button type="submit" class="mt-1 px-4 py-3 rounded-lg border border-zinc-300 bg-zinc-800 text-white font-medium hover:bg-zinc-700">Log in</button>
    </form>`;
    const footer = `<p class="mt-5 text-sm text-zinc-600">Don't have an account? <a href="/signup" class="text-blue-600 hover:underline">Sign up</a></p>`;
    const html = layoutAuth("Log in", body, footer);
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  // GET /signup — show form
  if (path === "/signup" && req.method === "GET") {
    const error = url.searchParams.get("error");
    const body = `
    <p class="text-zinc-600 text-sm mb-6 leading-snug">Create an account to save your topics and threads.</p>
    <form method="post" action="/signup" class="flex flex-col gap-3">
      <input type="email" name="email" placeholder="Email" required autocomplete="email" class="px-4 py-3 rounded-lg border border-zinc-200 bg-white text-zinc-900 text-base placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <input type="password" name="password" placeholder="Password (min 6 characters)" required minlength="6" autocomplete="new-password" class="px-4 py-3 rounded-lg border border-zinc-200 bg-white text-zinc-900 text-base placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      ${error ? `<p class="text-red-600 text-sm m-0">${escapeHtml(decodeURIComponent(error))}</p>` : ""}
      <button type="submit" class="mt-1 px-4 py-3 rounded-lg border border-zinc-300 bg-zinc-800 text-white font-medium hover:bg-zinc-700">Sign up</button>
    </form>`;
    const footer = `<p class="mt-5 text-sm text-zinc-600">Already have an account? <a href="/login" class="text-blue-600 hover:underline">Log in</a></p>`;
    const html = layoutAuth("Sign up", body, footer);
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  // POST /login — form email + password → Supabase token → set cookie → redirect /
  if (path === "/login" && req.method === "POST") {
    const body = await parseFormBody(req);
    const email = (body.email ?? "").trim();
    const password = body.password ?? "";
    if (!email || !password) {
      return redirect("/login?error=missing");
    }
    const config = getSupabaseAuthConfig();
    if (!config) return redirect("/login?error=config");
    const res = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.anonKey,
      },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    const accessToken = data.access_token;
    const err = data.error_description ?? data.msg ?? data.error;
    if (!res.ok || !accessToken) {
      const msg = err ? encodeURIComponent(String(err).slice(0, 200)) : "auth_failed";
      return redirect(`/login?error=${msg}`, undefined, isHttps);
    }
    return redirect("/", { name: SESSION_COOKIE_NAME, value: accessToken }, isHttps);
  }

  // POST /signup — form email + password → Supabase signup → set cookie if session, else redirect /login?message=confirm
  if (path === "/signup" && req.method === "POST") {
    const body = await parseFormBody(req);
    const email = (body.email ?? "").trim();
    const password = body.password ?? "";
    if (!email || !password) {
      return redirect("/signup?error=missing");
    }
    const config = getSupabaseAuthConfig();
    if (!config) return redirect("/signup?error=config");
    const res = await fetch(`${config.url}/auth/v1/signup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.anonKey,
      },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    const accessToken = data.access_token;
    const err = data.error_description ?? data.msg ?? data.error;
    if (!res.ok) {
      const msg = err ? encodeURIComponent(String(err).slice(0, 200)) : "signup_failed";
      return redirect(`/signup?error=${msg}`, undefined, isHttps);
    }
    if (accessToken) {
      return redirect("/", { name: SESSION_COOKIE_NAME, value: accessToken }, isHttps);
    }
    return redirect("/login?message=confirm", undefined, isHttps);
  }

  return new Response("Not found", { status: 404 });
}
