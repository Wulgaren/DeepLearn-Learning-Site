import type { Config, Context } from "@netlify/edge-functions";
import { getUserId, getTokenFromCookie, validateUuid } from "./lib/shared.ts";
import {
  escapeHtml,
  formatThreadDate,
  layout,
  layoutPublicThread,
} from "./lib/html.ts";

const FN = "html-app";

function apiHeaders(req: Request): HeadersInit {
  const token = getTokenFromCookie(req);
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
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

function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { Location: location } });
}

export default async function handler(
  req: Request,
  context: Context
): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // Pass through for API, serverless, and static assets
  if (
    path.startsWith("/api/") ||
    path.startsWith("/.netlify/") ||
    path.startsWith("/assets/") ||
    path.includes(".") // e.g. .css, .js, .svg
  ) {
    return context.next();
  }

  const origin = url.origin;
  const token = getTokenFromCookie(req);
  const userId = getUserId(req);

  // Prefer SPA when client has proven JS (cookie set by no-JS upgrade script).
  const prefersSpa =
    method === "GET" &&
    /(^|;\s)dl_js=1(\s|;|$)/.test(req.headers.get("cookie") ?? "");

  // ----- POST handlers (forms) -----

  if (method === "POST" && path === "/topics") {
    if (!userId) return redirect("/login");
    const body = await parseFormBody(req);
    const topic = (body.topic ?? "").trim().slice(0, 500);
    if (!topic) return redirect("/topics");
    const res = await fetch(`${origin}/api/feed-generate`, {
      method: "POST",
      headers: apiHeaders(req),
      body: JSON.stringify({ topic }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = (err as { error?: string }).error ?? "error";
      return redirect(`/topics?error=${encodeURIComponent(msg)}`);
    }
    return redirect("/topics");
  }

  if (method === "POST" && path === "/thread/new") {
    if (!userId) return redirect("/login");
    const body = await parseFormBody(req);
    const tweet = (body.tweet ?? "").trim().slice(0, 2000);
    if (!tweet) return redirect("/thread/new?error=missing");
    const res = await fetch(`${origin}/api/thread-from-tweet`, {
      method: "POST",
      headers: apiHeaders(req),
      body: JSON.stringify({ tweet }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = (err as { error?: string }).error ?? "error";
      return redirect(`/thread/new?error=${encodeURIComponent(msg)}`);
    }
    const data = (await res.json()) as { threadId?: string };
    if (data.threadId) return redirect(`/thread/${data.threadId}`);
    return redirect("/thread/new?error=unknown");
  }

  const threadAskMatch = path.match(/^\/thread\/([^/]+)\/ask$/);
  if (method === "POST" && threadAskMatch) {
    const threadId = threadAskMatch[1];
    if (!userId) return redirect("/login");
    if (!validateUuid(threadId)) return redirect("/");
    const body = await parseFormBody(req);
    const question = (body.question ?? "").trim().slice(0, 2000);
    if (!question) return redirect(`/thread/${threadId}`);
    const replyIndexRaw = body.replyIndex;
    const replyIndex =
      replyIndexRaw !== undefined && replyIndexRaw !== ""
        ? parseInt(replyIndexRaw, 10)
        : null;
    const res = await fetch(`${origin}/api/thread-ask`, {
      method: "POST",
      headers: apiHeaders(req),
      body: JSON.stringify({
        threadId,
        question,
        replyIndex: Number.isFinite(replyIndex) ? replyIndex : null,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = (err as { error?: string }).error ?? "error";
      return redirect(`/thread/${threadId}?error=${encodeURIComponent(msg)}`);
    }
    return redirect(`/thread/${threadId}`);
  }

  if (method === "POST" && path === "/interests-update") {
    if (!userId) return redirect("/login");
    const body = await parseFormBody(req);
    const addTags = (body.tags ?? "").trim();
    const remove = (body.remove ?? "").trim();
    const currentRes = await fetch(`${origin}/api/interests`, {
      headers: apiHeaders(req),
    });
    const currentData = (await currentRes.json()) as { tags?: string[] };
    let tags: string[] = Array.isArray(currentData.tags) ? currentData.tags : [];
    if (remove) tags = tags.filter((t) => t !== remove);
    if (addTags) {
      const toAdd = addTags
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .filter((t) => !tags.includes(t));
      tags = [...tags, ...toAdd].slice(0, 30);
    }
    await fetch(`${origin}/api/interests`, {
      method: "POST",
      headers: apiHeaders(req),
      body: JSON.stringify({ tags }),
    });
    return redirect("/");
  }

  // ----- GET handlers (auth pages are handled by auth edge) -----

  // Protected routes
  if (path === "/" || path === "/topics" || path === "/thread/new") {
    if (!userId) return redirect("/login");
  }

  if (method === "GET" && path === "/") {
    if (prefersSpa) return context.next();
    const [interestsRes, homeThreadsRes, homeTweetsRes] = await Promise.all([
      fetch(`${origin}/api/interests`, { headers: apiHeaders(req) }),
      fetch(`${origin}/api/home-threads`, { headers: apiHeaders(req) }),
      fetch(`${origin}/api/home-tweets`, {
        method: "POST",
        headers: apiHeaders(req),
        body: "{}",
      }),
    ]);
    const interestsData = (await interestsRes.json()) as { tags?: string[] };
    const homeThreadsData = (await homeThreadsRes.json()) as {
      threads?: Array<{ id: string; main_post: string; replies: unknown[]; created_at: string }>;
    };
    const tweetsData = (await homeTweetsRes.json()) as { tweets?: string[] };
    const tags = Array.isArray(interestsData.tags) ? interestsData.tags : [];
    const homeThreads = Array.isArray(homeThreadsData.threads)
      ? homeThreadsData.threads
      : [];
    const tweets = Array.isArray(tweetsData.tweets) ? tweetsData.tweets : [];

    const tagsHtml =
      tags.length > 0
        ? tags
            .map(
              (tag) =>
                `<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-200 text-sm text-zinc-800">${escapeHtml(tag)} <form method="post" action="/interests-update" style="display:inline"><input type="hidden" name="remove" value="${escapeHtml(tag)}" /><button type="submit" class="text-zinc-500 hover:text-zinc-900 bg-transparent border-0 cursor-pointer p-0" aria-label="Remove ${escapeHtml(tag)}">×</button></form></span>`
            )
            .join(" ")
        : "";

    const tweetsHtml =
      tweets.length > 0
        ? tweets
            .map(
              (tweet) =>
                `<div class="py-4 border-b border-zinc-200"><a href="/thread/new?tweet=${encodeURIComponent(tweet)}" class="no-underline text-zinc-900 hover:underline block"><p class="m-0 text-[1.05rem] leading-relaxed line-clamp-2 text-zinc-700">${escapeHtml(tweet)}</p></a></div>`
            )
            .join("")
        : tags.length === 0
          ? `<p class="text-zinc-600 text-sm py-6">Add interests below to see personalized tweet ideas here.</p>`
          : `<p class="text-zinc-600 text-sm py-6">No ideas right now. Try adding more interests.</p>`;

    const homeThreadsHtml =
      homeThreads.length > 0
        ? homeThreads
            .map(
              (t) =>
                `<div class="py-4 border-b border-zinc-200"><a href="/thread/${t.id}" class="no-underline text-zinc-900 hover:underline block"><p class="m-0 text-sm text-zinc-500">Thread · ${formatThreadDate(t.created_at)}</p><p class="m-0 mt-1 text-[1.05rem] leading-relaxed line-clamp-2 text-zinc-700">${escapeHtml(t.main_post)}</p></a></div>`
            )
            .join("")
        : `<p class="text-zinc-600 text-sm py-6">Threads you open from the suggestions above will appear here.</p>`;

    const body = `
    <div class="pb-10">
      <section class="py-5 border-b border-zinc-200">
        <h2 class="text-sm font-semibold text-zinc-600 mb-3">Your interests</h2>
        <form method="post" action="/interests-update" class="flex gap-2 mb-4">
          <input type="text" name="tags" placeholder="Add interests (comma-separated)" class="flex-1 px-4 py-2 rounded-full border border-zinc-200 bg-zinc-50 text-zinc-900 text-sm placeholder:text-zinc-400 outline-none" />
          <button type="submit" class="px-4 py-2 rounded-full font-semibold bg-zinc-800 text-white hover:bg-zinc-700 text-sm">Add</button>
        </form>
        ${tagsHtml ? `<div class="flex flex-wrap gap-2">${tagsHtml}</div>` : "<p class=\"text-zinc-600 text-sm\">Add interests above to get personalized tweet ideas.</p>"}
      </section>
      <section class="pt-6">
        <h2 class="text-sm font-semibold text-zinc-600 mb-3">For you</h2>
        ${tweetsHtml}
      </section>
      <section class="pt-6 border-t border-zinc-200">
        <h2 class="text-sm font-semibold text-zinc-600 mb-3">Your threads</h2>
        ${homeThreadsHtml}
      </section>
    </div>`;

    const html = layout(body, {
      nav: [
        { label: "Home", href: "/", active: true },
        { label: "My topics", href: "/topics", active: false },
      ],
      headerTitle: "Home",
      userEmail: undefined, // we don't have email in JWT easily; could skip or decode
      injectJsUpgrade: true,
    });
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  if (method === "GET" && path === "/topics") {
    if (prefersSpa) return context.next();
    const feedRes = await fetch(`${origin}/api/feed`, { headers: apiHeaders(req) });
    if (!feedRes.ok) return redirect("/login");
    const feedData = (await feedRes.json()) as {
      topics?: Array<{ id: string; query: string; created_at: string }>;
      threadsByTopic?: Record<string, Array<{ id: string; main_post: string; replies: unknown[]; created_at: string }>>;
    };
    const topics = Array.isArray(feedData.topics) ? feedData.topics : [];
    const threadsByTopic = feedData.threadsByTopic ?? {};

    const feedError = url.searchParams.get("error");

    const topicsHtml =
      topics.length === 0
        ? `<div class="py-10"><p class="m-0 text-zinc-600">No topics yet.</p><p class="m-0 mt-2 text-sm text-zinc-500">Use the composer above to generate your first set of threads.</p></div>`
        : topics
            .map(
              (topic) => {
                const threads = threadsByTopic[topic.id] ?? [];
                const threadsList =
                  threads.length === 0
                    ? `<div class="py-6 text-sm text-zinc-600">No threads yet for this topic.</div>`
                    : threads
                        .map(
                          (th) =>
                            `<li class="border-b border-zinc-200 last:border-b-0"><a href="/thread/${th.id}" class="block py-4 no-underline text-zinc-900 hover:underline"><span class="text-sm text-zinc-500">${formatThreadDate(th.created_at)}</span><p class="m-0 mt-1 line-clamp-3 text-zinc-700">${escapeHtml(th.main_post)}</p></a></li>`
                        )
                        .join("");
                return `
                <div>
                  <div class="sticky top-[50px] z-[5] bg-white/90 backdrop-blur border-b border-zinc-200 px-1 py-3">
                    <h2 class="m-0 text-sm font-semibold text-zinc-800 truncate">${escapeHtml(topic.query)}</h2>
                  </div>
                  <ul class="list-none p-0 m-0">${threadsList}</ul>
                </div>`;
              }
            )
            .join("");

    const body = `
    <div class="pb-10">
      <section class="py-5 border-b border-zinc-200">
        <form method="post" action="/topics" class="flex gap-3">
          <div class="flex-1 min-w-0">
            <input type="text" name="topic" placeholder='e.g. "React hooks", "Postgres", "LLMs"' maxlength="500" class="w-full bg-transparent text-zinc-900 text-[1.05rem] placeholder:text-zinc-400 outline-none py-2.5" />
            <div class="mt-3 flex items-center justify-end">
              <button type="submit" class="px-4 py-2 rounded-full font-semibold bg-zinc-800 text-white hover:bg-zinc-700">Generate</button>
            </div>
            ${feedError ? `<p class="mt-3 text-red-600 text-sm">${escapeHtml(decodeURIComponent(feedError))}</p>` : ""}
          </div>
        </form>
      </section>
      <section class="pt-1">${topicsHtml}</section>
    </div>`;

    const html = layout(body, {
      nav: [
        { label: "Home", href: "/", active: false },
        { label: "My topics", href: "/topics", active: true },
      ],
      headerTitle: "My topics",
      userEmail: undefined,
      injectJsUpgrade: true,
    });
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  if (method === "GET" && path === "/thread/new") {
    if (prefersSpa) return context.next();
    const tweetParam = url.searchParams.get("tweet") ?? "";
    const tweet = tweetParam.trim().slice(0, 2000);

    // Suggestion click: create thread immediately and redirect (user sees loading until done)
    if (tweet && userId) {
      const res = await fetch(`${origin}/api/thread-from-tweet`, {
        method: "POST",
        headers: apiHeaders(req),
        body: JSON.stringify({ tweet }),
      });
      if (res.ok) {
        const data = (await res.json()) as { threadId?: string };
        if (data.threadId) return redirect(`/thread/${data.threadId}`);
      }
      const err = await res.json().catch(() => ({}));
      const msg = (err as { error?: string }).error ?? "error";
      return redirect(`/thread/new?tweet=${encodeURIComponent(tweetParam)}&error=${encodeURIComponent(msg)}`);
    }

    const err = url.searchParams.get("error");
    const body = `
    <div class="py-10">
      <form method="post" action="/thread/new" class="max-w-xl">
        <label class="block text-sm text-zinc-600 mb-2">Paste or enter a tweet idea</label>
        <textarea name="tweet" rows="4" maxlength="2000" placeholder="e.g. How React hooks replace class lifecycle methods" class="w-full px-4 py-3 rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-900 placeholder:text-zinc-400 outline-none resize-none">${escapeHtml(tweetParam)}</textarea>
        ${err ? `<p class="mt-2 text-red-600 text-sm">${escapeHtml(decodeURIComponent(err))}</p>` : ""}
        <button type="submit" class="mt-4 px-4 py-2 rounded-full font-semibold bg-zinc-800 text-white hover:bg-zinc-700">Create thread</button>
      </form>
    </div>`;
    const html = layout(body, {
      nav: [
        { label: "Home", href: "/", active: false },
        { label: "My topics", href: "/topics", active: false },
      ],
      headerTitle: "New thread",
      headerBackHref: "/",
      userEmail: undefined,
      injectJsUpgrade: true,
    });
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const threadMatch = path.match(/^\/thread\/([^/]+)$/);
  if (method === "GET" && threadMatch) {
    if (prefersSpa) return context.next();
    const threadId = threadMatch[1];
    if (!validateUuid(threadId)) return context.next();
    const threadRes = await fetch(
      `${origin}/api/thread-get?threadId=${encodeURIComponent(threadId)}`,
      { headers: apiHeaders(req) }
    );
    if (!threadRes.ok) {
      if (threadRes.status === 404 || threadRes.status === 403) {
        const body = `<p class="py-4 text-red-600">Thread not found or you don't have access.</p>`;
        const html = layout(body, {
          headerTitle: "Post",
          headerBackHref: "/",
          rightSidebar: !!userId,
        });
        return new Response(html, {
          status: 404,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
      return context.next();
    }
    const threadData = (await threadRes.json()) as {
      thread?: {
        id: string;
        main_post: string;
        replies: Array<{ type?: string; content?: string } | string>;
        created_at: string;
      };
    };
    const thread = threadData.thread;
    if (!thread) return context.next();
    const replies = Array.isArray(thread.replies) ? thread.replies : [];
    const threadError = url.searchParams.get("error");

    const replyToContent = (r: { type?: string; content?: string } | string): string =>
      typeof r === "string" ? r : (r?.content ?? "");

    const repliesHtml = replies
      .map((reply, i) => {
        const isTyped =
          typeof reply === "object" && reply !== null && "type" in reply;
        const content = isTyped
          ? replyToContent(reply as { type?: string; content?: string })
          : String(reply);
        const label = isTyped
          ? (reply as { type?: string }).type === "user"
            ? "You"
            : "AI"
          : "Reply";
        const meta = isTyped ? "" : `#${i + 1}`;
        const askForm =
          userId
            ? `<div class="mt-4 mb-1 ml-10 md:ml-12">
                <form method="post" action="/thread/${threadId}/ask">
                  <input type="hidden" name="replyIndex" value="${i}" />
                  <input type="text" name="question" placeholder="Ask a follow-up about this reply…" maxlength="2000" class="w-full bg-transparent text-[1.05rem] placeholder:text-zinc-400 text-zinc-900 outline-none py-2" />
                  <button type="submit" class="mt-2 px-4 py-2 rounded-full font-semibold bg-zinc-800 text-white hover:bg-zinc-700">Ask</button>
                </form>
              </div>`
            : "";
        return `<article class="py-4 border-b border-zinc-200 pl-10 md:pl-12 border-l-2 border-zinc-200 ml-2">
          <p class="m-0 text-xs text-zinc-500">${escapeHtml(label)} ${meta}</p>
          <p class="m-0 mt-1 text-sm leading-relaxed whitespace-pre-wrap break-words text-zinc-700">${escapeHtml(content)}</p>
          ${askForm}
        </article>`;
      })
      .join("");

    const mainAskForm = userId
      ? `<section class="px-1 py-5 pb-8 border-b border-zinc-200">
          <form method="post" action="/thread/${threadId}/ask" class="flex gap-3">
            <div class="flex-1">
              <input type="text" name="question" placeholder="Ask a follow-up question…" maxlength="2000" class="w-full bg-transparent text-[1.05rem] placeholder:text-zinc-400 text-zinc-900 outline-none py-2" />
              ${threadError ? `<p class="mt-2 text-red-600 text-sm">${escapeHtml(decodeURIComponent(threadError))}</p>` : ""}
              <button type="submit" class="mt-2 px-4 py-2 rounded-full font-semibold bg-zinc-800 text-white hover:bg-zinc-700">Ask</button>
            </div>
          </form>
        </section>`
      : "";

    const threadBody = `
    <div class="pb-16">
      <article class="border-b border-zinc-200">
        <p class="m-0 pt-3 text-xs text-zinc-500">Thread</p>
        <p class="m-0 mt-2 mb-4 text-[1.05rem] leading-relaxed whitespace-pre-wrap break-words text-zinc-900">${escapeHtml(thread.main_post)}</p>
      </article>
      ${mainAskForm}
      <section class="divide-y divide-zinc-200">${repliesHtml}</section>
    </div>`;

    const usePublicLayout = !userId;
    const html = usePublicLayout
      ? layoutPublicThread(threadBody, "Post", "/", { injectJsUpgrade: true })
      : layout(threadBody, {
          nav: [
            { label: "Home", href: "/", active: false },
            { label: "My topics", href: "/topics", active: false },
          ],
          headerTitle: "Post",
          headerBackHref: "/",
          userEmail: undefined,
          rightSidebar: true,
          injectJsUpgrade: true,
        });
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return context.next();
}

export const config: Config = {
  path: "/*",
};
