// Minimal HTML sanitizer for LiteAPI's hotel description, which arrives with
// `<p>`, `<strong>`, `<em>`, `<ul>`, `<li>`, `<br>` markup baked into the
// payload. We render via dangerouslySetInnerHTML, so we strip everything
// outside a small whitelist as defense-in-depth.
//
// Why not sanitize-html: that package + @types/sanitize-html + the
// @tailwindcss/typography plugin would be 3 new dependencies for one render
// site. The whitelist below is small enough to enforce in ~30 lines with
// zero deps. Tested below in tests/lib-html-sanitize.test.ts in CI when
// added.

const ALLOWED_TAGS = new Set([
  "p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li",
  "h2", "h3", "h4",
]);

// Pre-render any entity-encoded content, then strip everything outside the
// whitelist. We do this on the server, before sending HTML down to the page.
export function sanitizeHotelDescription(input: string | null | undefined): string {
  if (!input) return "";
  let html = String(input).trim();
  if (!html) return "";

  // 1. Strip <script> / <style> blocks (greedy).
  html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  html = html.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");

  // 2. Strip event handlers and javascript: in href / src.
  html = html.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  html = html.replace(/(href|src)\s*=\s*("javascript:[^"]*"|'javascript:[^']*')/gi, "$1=\"#\"");

  // 3. Walk every tag; drop any not in the allowlist. Strip ALL attributes
  //    on remaining tags — the allowlist is purely structural.
  html = html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (match, tagRaw: string) => {
    const tag = tagRaw.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    const isClosing = match.startsWith("</");
    const selfClosing = tag === "br";
    return isClosing ? `</${tag}>` : selfClosing ? `<${tag} />` : `<${tag}>`;
  });

  // 4. Collapse > 2 consecutive whitespace lines.
  html = html.replace(/(\s*\n){3,}/g, "\n\n").trim();

  return html;
}
