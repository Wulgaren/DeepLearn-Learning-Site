import type { Config, Context } from "@netlify/edge-functions";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { log, validateUuid } from "./lib/shared.ts";

const FN = "thread-embed";

/** User-Agent substrings for crawlers that render Open Graph / embeds (Discord, Twitter, Slack, etc.) */
const CRAWLER_AGENTS = [
  "Discordbot",
  "Twitterbot",
  "Slackbot",
  "facebookexternalhit",
  "LinkedInBot",
  "WhatsApp",
  "TelegramBot",
  "Pinterest",
  "Slurp", // Yahoo
  "embed",
];

function isCrawler(req: Request): boolean {
  const ua = req.headers.get("user-agent") ?? "";
  return CRAWLER_AGENTS.some((bot) => ua.includes(bot));
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function truncate(str: string, maxLen: number): string {
  const cleaned = str.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen - 1).trim() + "…";
}

export default async function handler(req: Request, context: Context): Promise<Response | undefined> {
  if (req.method !== "GET") return undefined;

  const { threadId } = context.params ?? {};
  if (!threadId || threadId === "new" || !validateUuid(threadId)) {
    return undefined;
  }

  if (!isCrawler(req)) {
    return undefined;
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseServiceKey) {
    log(FN, "warn", "Missing Supabase env");
    return undefined;
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data: thread, error: threadError } = await supabase
    .from("threads")
    .select("id, main_post")
    .eq("id", threadId)
    .single();

  if (threadError || !thread || !thread.main_post) {
    log(FN, "info", "Thread not found or no main_post for embed", { threadId });
    return undefined;
  }

  const siteUrl = context.site?.url ?? new URL(req.url).origin;
  const pageUrl = `${siteUrl}/thread/${threadId}`;
  const imageUrl = `${siteUrl}/learning-icon.svg`;
  const title = truncate(String(thread.main_post).replace(/\s+/g, " ").trim(), 60);
  const description = truncate(String(thread.main_post).replace(/\s+/g, " ").trim(), 200);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${escapeHtml(pageUrl)}" />
  <meta property="og:image" content="${escapeHtml(imageUrl)}" />
  <meta property="og:site_name" content="DeepLearn" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
  <title>${escapeHtml(title)}</title>
  <meta http-equiv="refresh" content="0;url=${escapeHtml(pageUrl)}" />
</head>
<body><p>Redirecting to <a href="${escapeHtml(pageUrl)}">thread</a>…</p></body>
</html>`;

  log(FN, "info", "Embed served", { threadId });
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export const config: Config = {
  path: "/thread/:threadId",
};
