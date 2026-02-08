import { criticalCss } from "./critical-css.ts";

/** Escape for HTML text content to prevent XSS. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Format ISO date for display. */
export function formatThreadDate(created_at: string): string {
  try {
    const d = new Date(created_at);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

const LAYOUT_OPTS = {
  title: "DeepLearn",
  cssHref: "/site.css",
};

type NavItem = { label: string; href: string; active?: boolean };

export function layout(
  body: string,
  opts: {
    title?: string;
    nav?: NavItem[];
    headerTitle?: string;
    headerBackHref?: string;
    userEmail?: string;
    rightSidebar?: boolean;
    theme?: "dark" | "light";
  } = {}
): string {
  const title = opts.title ?? LAYOUT_OPTS.title;
  const nav = opts.nav ?? [];
  const headerTitle = opts.headerTitle ?? "Home";
  const headerBackHref = opts.headerBackHref;
  const userEmail = opts.userEmail;
  const rightSidebar = opts.rightSidebar !== false;
  const light = opts.theme !== "dark";

  const gridCols = rightSidebar
    ? "grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_320px]"
    : "grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)]";

  const navLinkClass = light
    ? (n: NavItem) => (n.active ? "font-semibold text-zinc-900" : "text-zinc-500 hover:text-zinc-900")
    : (n: NavItem) => (n.active ? "font-semibold text-zinc-100" : "text-zinc-400 hover:text-zinc-100");
  const navHtml = nav
    .map(
      (n) =>
        `<a href="${escapeHtml(n.href)}" class="${navLinkClass(n)} no-underline">${escapeHtml(n.label)}</a>`
    )
    .join("\n                ");

  const backLink =
    headerBackHref != null
      ? light
        ? `<a href="${escapeHtml(headerBackHref)}" class="text-zinc-600 no-underline hover:text-zinc-900 shrink-0">←</a>`
        : `<a href="${escapeHtml(headerBackHref)}" class="text-zinc-300 no-underline hover:text-white shrink-0">←</a>`
      : "";

  const headerRight = userEmail
    ? `<span class="text-xs text-zinc-500 truncate min-w-0">${escapeHtml(userEmail)}</span>`
    : "";

  const rightAside = rightSidebar
    ? light
      ? `<aside class="hidden lg:block sticky top-0 h-screen py-4">
        <form method="post" action="/topics" class="rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2">
          <input type="text" name="topic" placeholder="What do you want to learn today?" maxlength="500" class="w-full bg-transparent outline-none text-sm placeholder:text-zinc-400 text-zinc-900" />
        </form>
        <section class="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 mt-4">
          <h3 class="m-0 text-sm font-semibold text-zinc-900">Tips</h3>
          <p class="m-0 mt-2 text-sm text-zinc-600 leading-relaxed">Generate threads for a topic, then open one to read replies and ask follow-up questions.</p>
        </section>
      </aside>`
      : `<aside class="hidden lg:block sticky top-0 h-screen py-4">
        <form method="post" action="/topics" class="rounded-full border border-zinc-800 bg-zinc-950/60 px-4 py-2">
          <input type="text" name="topic" placeholder="What do you want to learn today?" maxlength="500" class="w-full bg-transparent outline-none text-sm placeholder:text-zinc-500" />
        </form>
        <section class="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 mt-4">
          <h3 class="m-0 text-sm font-semibold">Tips</h3>
          <p class="m-0 mt-2 text-sm text-zinc-400 leading-relaxed">Generate threads for a topic, then open one to read replies and ask follow-up questions.</p>
        </section>
      </aside>`
    : "";

  const bodyClass = light ? "min-h-screen bg-white text-zinc-900 antialiased" : "min-h-screen bg-black text-zinc-100 antialiased";
  const style = light
    ? ":root{color-scheme:light;}body{background:#fff;color:rgb(24 24 27);font-family:system-ui,sans-serif;margin:0;min-height:100vh;}"
    : ":root{color-scheme:dark;}body{background:#000;color:rgb(244 244 245);font-family:system-ui,sans-serif;margin:0;min-height:100vh;}";
  const mainBorder = light ? "border-zinc-200" : "border-zinc-800/80";
  const headerClass = light
    ? "sticky top-0 z-10 backdrop-blur bg-white/90 border-b border-zinc-200"
    : "sticky top-0 z-10 backdrop-blur bg-black/70 border-b border-zinc-800/80";
  const logoClass = light ? "text-zinc-900" : "text-zinc-100";
  const logoutClass = light ? "text-zinc-500 hover:text-zinc-900" : "text-zinc-400 hover:text-zinc-100";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="${escapeHtml(LAYOUT_OPTS.cssHref)}" />
  <style>${style}</style>
  ${criticalCss ? `<style>${criticalCss}</style>` : ""}
</head>
<body class="${bodyClass}">
  <div class="mx-auto w-full max-w-6xl px-4">
    <div class="grid gap-6 ${gridCols}">
      <aside class="hidden lg:block sticky top-0 h-screen py-4">
        <div class="flex h-full flex-col">
          <a href="/" class="${logoClass} no-underline font-semibold text-lg">DeepLearn</a>
          <nav class="mt-4 flex flex-col gap-1 text-sm">
            ${navHtml}
          </nav>
          ${userEmail ? `<form method="post" action="/logout" class="mt-4"><button type="submit" class="${logoutClass} text-sm bg-transparent border-0 cursor-pointer p-0">Log out</button></form>` : ""}
        </div>
      </aside>
      <main class="min-h-screen lg:border-x ${mainBorder}">
        <header class="${headerClass}">
          <div class="px-4 py-3 flex items-center gap-3 min-w-0">
            ${backLink}
            <span class="font-semibold text-[1.05rem] min-w-0 truncate flex-1">${escapeHtml(headerTitle)}</span>
            ${headerRight}
          </div>
        </header>
        <div class="px-4">
          ${body}
        </div>
      </main>
      ${rightAside}
    </div>
  </div>
</body>
</html>`;
}

/** Auth pages: centered form, no nav. White/light mode. */
export function layoutAuth(title: string, body: string, footerHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)} – DeepLearn</title>
  <link rel="stylesheet" href="${escapeHtml(LAYOUT_OPTS.cssHref)}" />
  <style>:root{color-scheme:light;}body{background:#fff;color:rgb(24 24 27);font-family:system-ui,sans-serif;margin:0;min-height:100vh;}</style>
  ${criticalCss ? `<style>${criticalCss}</style>` : ""}
</head>
<body class="min-h-screen flex items-center justify-center p-4 bg-white text-zinc-900">
  <div class="w-full max-w-[360px] rounded-xl border border-zinc-200 bg-zinc-50 p-8 shadow-xl">
    <h1 class="text-2xl font-semibold m-0 mb-2 text-zinc-900">${escapeHtml(title)}</h1>
    ${body}
    ${footerHtml}
  </div>
</body>
</html>`;
}

/** Layout for public thread (no sidebar nav, no user). Light/white mode. */
export function layoutPublicThread(body: string, headerTitle: string, backHref: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(headerTitle)} – DeepLearn</title>
  <link rel="stylesheet" href="${escapeHtml(LAYOUT_OPTS.cssHref)}" />
  <style>:root{color-scheme:light;}body{background:#fff;color:rgb(24 24 27);font-family:system-ui,sans-serif;margin:0;min-height:100vh;}</style>
  ${criticalCss ? `<style>${criticalCss}</style>` : ""}
</head>
<body class="min-h-screen bg-white text-zinc-900 antialiased">
  <div class="mx-auto w-full max-w-6xl px-4">
    <div class="grid gap-6 grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside class="hidden lg:block sticky top-0 h-screen py-4">
        <a href="${escapeHtml(backHref)}" class="text-zinc-900 no-underline font-semibold text-lg">DeepLearn</a>
      </aside>
      <main class="min-h-screen lg:border-x border-zinc-200">
        <header class="sticky top-0 z-10 backdrop-blur bg-white/90 border-b border-zinc-200">
          <div class="px-4 py-3 flex items-center gap-3 min-w-0">
            <a href="${escapeHtml(backHref)}" class="text-zinc-600 no-underline hover:text-zinc-900 shrink-0">←</a>
            <span class="font-semibold text-[1.05rem] min-w-0 truncate flex-1">${escapeHtml(headerTitle)}</span>
          </div>
        </header>
        <div class="px-4">${body}</div>
      </main>
    </div>
  </div>
</body>
</html>`;
}
