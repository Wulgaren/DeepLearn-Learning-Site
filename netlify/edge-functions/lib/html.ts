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

const LAYOUT_OPTS = { title: "DeepLearn" };

type NavItem = { label: string; href: string; active?: boolean };

/** Injected in <head> when serving no-JS HTML so JS-enabled clients set cookie and reload before paint. */
const JS_UPGRADE_SCRIPT =
  '<script>document.cookie="dl_js=1;path=/;max-age=31536000";window.location.reload();</script>';

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
    /** If true, inject script that sets dl_js cookie and reloads so next request gets SPA. */
    injectJsUpgrade?: boolean;
  } = {}
): string {
  const title = opts.title ?? LAYOUT_OPTS.title;
  const nav = opts.nav ?? [];
  const headerTitle = opts.headerTitle ?? "Home";
  const headerBackHref = opts.headerBackHref;
  const userEmail = opts.userEmail;
  const rightSidebar = opts.rightSidebar !== false;
  const light = opts.theme !== "dark";

  const bodyStyle = light
    ? "background:#fff;color:#18181b;font-family:system-ui,sans-serif;margin:0;min-height:100vh;"
    : "background:#000;color:#f4f4f5;font-family:system-ui,sans-serif;margin:0;min-height:100vh;";
  const navLinkStyle = (n: NavItem) =>
    light
      ? `font-size:1.25rem;font-weight:600;padding:0.5rem 0.75rem;display:block;text-decoration:none;color:${n.active ? "#18181b" : "#71717a"};`
      : `font-size:1.25rem;font-weight:600;padding:0.5rem 0.75rem;display:block;text-decoration:none;color:${n.active ? "#fafafa" : "#a1a1aa"};`;
  const navHtml = nav
    .map((n) => `<a href="${escapeHtml(n.href)}" style="${navLinkStyle(n)}">${escapeHtml(n.label)}</a>`)
    .join("\n          ");

  const backLink =
    headerBackHref != null
      ? `<a href="${escapeHtml(headerBackHref)}" style="text-decoration:none;color:${light ? "#52525b" : "#d4d4d8"};flex-shrink:0;">←</a>`
      : "";

  const headerRight = userEmail
    ? `<span style="font-size:0.75rem;color:${light ? "#71717a" : "#71717a"};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(userEmail)}</span>`
    : "";

  const jsUpgrade = opts.injectJsUpgrade === true;
  const rightAside = rightSidebar
    ? light
      ? `<aside style="padding:1rem 0;"><form method="post" action="/topics" style="border:1px solid #e4e4e7;border-radius:9999px;background:#fafafa;padding:0.5rem 1rem;"><input type="text" name="topic" placeholder="What do you want to learn today?" maxlength="500" style="width:100%;background:transparent;border:0;outline:0;font-size:0.875rem;" /></form><section style="border:1px solid #e4e4e7;border-radius:1rem;background:#fafafa;padding:1rem;margin-top:1rem;"><h3 style="margin:0;font-size:0.875rem;font-weight:600;color:#18181b;">Tips</h3><p style="margin:0.5rem 0 0;font-size:0.875rem;color:#52525b;line-height:1.5;">Generate threads for a topic, then open one to read replies and ask follow-up questions.</p></section></aside>`
      : `<aside style="padding:1rem 0;"><form method="post" action="/topics" style="border:1px solid #27272a;border-radius:9999px;background:rgba(9,9,11,0.6);padding:0.5rem 1rem;"><input type="text" name="topic" placeholder="What do you want to learn today?" maxlength="500" style="width:100%;background:transparent;border:0;outline:0;font-size:0.875rem;color:inherit;" /></form><section style="border:1px solid #27272a;border-radius:1rem;background:rgba(9,9,11,0.6);padding:1rem;margin-top:1rem;"><h3 style="margin:0;font-size:0.875rem;font-weight:600;">Tips</h3><p style="margin:0.5rem 0 0;font-size:0.875rem;color:#a1a1aa;line-height:1.5;">Generate threads for a topic, then open one to read replies and ask follow-up questions.</p></section></aside>`
    : "";

  const logoColor = light ? "#18181b" : "#f4f4f5";
  const headerBorder = light ? "#e4e4e7" : "rgba(39,39,42,0.8)";
  const mainBorder = light ? "#e4e4e7" : "rgba(39,39,42,0.8)";
  const logoutColor = light ? "#71717a" : "#a1a1aa";

  const gridCols = rightSidebar ? "260px minmax(0,1fr) 320px" : "260px minmax(0,1fr)";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>body{${bodyStyle}}@media(max-width:768px){.dl-grid{grid-template-columns:1fr !important;}}</style>
  ${jsUpgrade ? JS_UPGRADE_SCRIPT : ""}
</head>
<body style="${bodyStyle}">
  <div style="max-width:72rem;margin:0 auto;padding:0 1rem;">
    <div class="dl-grid" style="display:grid;gap:1.5rem;grid-template-columns:${gridCols};">
      <aside style="padding:1rem 0;">
        <div style="display:flex;flex-direction:column;height:100%;">
          <a href="/" style="color:${logoColor};text-decoration:none;font-weight:600;font-size:1.125rem;">DeepLearn</a>
          <nav style="margin-top:1rem;display:flex;flex-direction:column;gap:0.25rem;">
            ${navHtml}
          </nav>
          ${userEmail ? `<form method="post" action="/logout" style="margin-top:1rem;"><button type="submit" style="background:0;border:0;cursor:pointer;padding:0;font-size:1rem;color:${logoutColor};">Log out</button></form>` : ""}
        </div>
      </aside>
      <main style="min-height:100vh;border-left:1px solid ${mainBorder};border-right:1px solid ${mainBorder};">
        <header style="padding:0.75rem 1rem;border-bottom:1px solid ${headerBorder};display:flex;align-items:center;gap:0.75rem;">
          ${backLink}
          <span style="font-weight:600;font-size:1.2rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">${escapeHtml(headerTitle)}</span>
          ${headerRight}
        </header>
        <div style="padding:1rem;">
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
export function layoutAuth(
  title: string,
  body: string,
  footerHtml: string,
  opts?: { injectJsUpgrade?: boolean }
): string {
  const jsUpgrade = opts?.injectJsUpgrade === true;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)} – DeepLearn</title>
  <style>body{background:#fff;color:#18181b;font-family:system-ui,sans-serif;margin:0;min-height:100vh;}</style>
  ${jsUpgrade ? JS_UPGRADE_SCRIPT : ""}
</head>
<body style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1rem;background:#fff;color:#18181b;">
  <div style="width:100%;max-width:360px;border-radius:0.75rem;border:1px solid #e4e4e7;background:#fafafa;padding:2rem;">
    <h1 style="font-size:1.5rem;font-weight:600;margin:0 0 0.5rem;color:#18181b;">${escapeHtml(title)}</h1>
    ${body}
    ${footerHtml}
  </div>
</body>
</html>`;
}

/** Layout for public thread (no sidebar nav, no user). Light/white mode. */
export function layoutPublicThread(
  body: string,
  headerTitle: string,
  backHref: string,
  opts?: { injectJsUpgrade?: boolean }
): string {
  const jsUpgrade = opts?.injectJsUpgrade === true;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(headerTitle)} – DeepLearn</title>
  <style>body{background:#fff;color:#18181b;font-family:system-ui,sans-serif;margin:0;min-height:100vh;}</style>
  ${jsUpgrade ? JS_UPGRADE_SCRIPT : ""}
</head>
<body style="background:#fff;color:#18181b;min-height:100vh;">
  <div style="max-width:72rem;margin:0 auto;padding:0 1rem;">
    <div style="display:grid;gap:1.5rem;grid-template-columns:260px minmax(0,1fr);">
      <aside style="padding:1rem 0;">
        <a href="${escapeHtml(backHref)}" style="color:#18181b;text-decoration:none;font-weight:600;font-size:1.125rem;">DeepLearn</a>
      </aside>
      <main style="min-height:100vh;border-left:1px solid #e4e4e7;border-right:1px solid #e4e4e7;">
        <header style="padding:0.75rem 1rem;border-bottom:1px solid #e4e4e7;display:flex;align-items:center;gap:0.75rem;">
          <a href="${escapeHtml(backHref)}" style="text-decoration:none;color:#52525b;">←</a>
          <span style="font-weight:600;font-size:1.2rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">${escapeHtml(headerTitle)}</span>
        </header>
        <div style="padding:1rem;">${body}</div>
      </main>
    </div>
  </div>
</body>
</html>`;
}
