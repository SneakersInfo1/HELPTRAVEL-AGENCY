// Ekstrakcja sygnałów SEO z surowego HTML odpowiedzi serwera.
//
// Używane przez crawler (scripts/seo/crawl.ts) i smoke testy po buildzie.
// Celowo bez przeglądarki i bez zależności: mierzymy to, co dostaje robot,
// który NIE wykonuje JavaScriptu. Jeśli treść jest tylko po stronie klienta,
// ten parser jej nie zobaczy — i to jest informacja, nie błąd parsera.

export interface JsonLdBlock {
  types: string[];
  raw: unknown;
}

export interface HtmlAudit {
  lang: string | null;
  titles: string[];
  /** Tytuł wewnątrz <head> (to, co robot bierze bez wątpliwości). */
  titleInHead: boolean;
  metaDescription: string | null;
  metaRobots: string | null;
  canonicals: string[];
  canonicalInHead: boolean;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  twitterTitle: string | null;
  twitterDescription: string | null;
  hreflangs: string[];
  h1: string[];
  h2: string[];
  jsonLd: JsonLdBlock[];
  jsonLdErrors: number;
  /** Słowa widocznej treści w <main> (bez skryptów, stylów i znaczników). */
  mainWordCount: number;
  /** Tekst <main> po spłaszczeniu — do porównań podobieństwa. */
  mainText: string;
  internalLinks: string[];
  externalLinkCount: number;
  imagesWithoutAlt: number;
  imageCount: number;
}

const ENTITY: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
};

export function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const value = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(value) && value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : match;
    }
    return ENTITY[code.toLowerCase()] ?? match;
  });
}

function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<template\b[\s\S]*?<\/template>/gi, " ")
      // Komentarz znika bez spacji: React rozdziela nim sąsiednie węzły tekstu
      // („Rzym<!-- -->?"), więc spacja doklejałaby odstęp, którego nie ma na stronie.
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function attr(tag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  if (!match) return null;
  return decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
}

function tags(html: string, name: string): string[] {
  return html.match(new RegExp(`<${name}\\b[^>]*>`, "gi")) ?? [];
}

function blocks(html: string, name: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, "gi");
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) out.push(match[1]);
  return out;
}

function collectTypes(node: unknown, into: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectTypes(item, into);
    return;
  }
  if (!node || typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  const type = record["@type"];
  if (typeof type === "string") into.add(type);
  else if (Array.isArray(type)) for (const t of type) if (typeof t === "string") into.add(t);
  if (record["@graph"]) collectTypes(record["@graph"], into);
}

export function countWords(text: string): number {
  if (!text) return 0;
  return text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

export function auditHtml(html: string, pageUrl: string): HtmlAudit {
  const headEnd = html.search(/<\/head>/i);
  const head = headEnd >= 0 ? html.slice(0, headEnd) : "";
  const page = new URL(pageUrl);

  const titles = blocks(html, "title")
    .map((t) => stripTags(t))
    .filter(Boolean);
  // <title> wewnątrz <svg> to etykieta grafiki, nie tytuł dokumentu.
  const svgTitles = blocks(html, "svg").flatMap((svg) => blocks(svg, "title").map((t) => stripTags(t)));
  const documentTitles = titles.filter((t) => {
    const index = svgTitles.indexOf(t);
    if (index >= 0) {
      svgTitles.splice(index, 1);
      return false;
    }
    return true;
  });

  const metas = tags(html, "meta");
  const metaByName = (key: string) => {
    const tag = metas.find((m) => (attr(m, "name") ?? attr(m, "property"))?.toLowerCase() === key);
    return tag ? attr(tag, "content") : null;
  };

  const links = tags(html, "link");
  const canonicalTags = links.filter((l) => attr(l, "rel")?.toLowerCase() === "canonical");
  const canonicals = canonicalTags.map((l) => attr(l, "href") ?? "").filter(Boolean);
  const hreflangs = links
    .filter((l) => attr(l, "rel")?.toLowerCase() === "alternate" && attr(l, "hreflang"))
    .map((l) => `${attr(l, "hreflang")}=${attr(l, "href")}`);

  const jsonLd: JsonLdBlock[] = [];
  let jsonLdErrors = 0;
  const ldRe = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let ld: RegExpExecArray | null;
  while ((ld = ldRe.exec(html))) {
    try {
      const raw: unknown = JSON.parse(ld[1]);
      const types = new Set<string>();
      collectTypes(raw, types);
      jsonLd.push({ types: [...types], raw });
    } catch {
      jsonLdErrors += 1;
    }
  }

  const mainHtml = blocks(html, "main")[0] ?? "";
  const mainText = stripTags(mainHtml);

  const internal = new Set<string>();
  let externalLinkCount = 0;
  for (const anchor of tags(html, "a")) {
    const href = attr(anchor, "href");
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/i.test(href)) continue;
    let target: URL;
    try {
      target = new URL(href, page);
    } catch {
      continue;
    }
    if (target.host === page.host) {
      target.hash = "";
      internal.add(target.pathname + target.search);
    } else {
      externalLinkCount += 1;
    }
  }

  const images = tags(html, "img");

  return {
    lang: (() => {
      const htmlTag = tags(html, "html")[0];
      return htmlTag ? attr(htmlTag, "lang") : null;
    })(),
    titles: documentTitles,
    titleInHead: /<title\b/i.test(head),
    metaDescription: metaByName("description"),
    metaRobots: metaByName("robots"),
    canonicals,
    canonicalInHead: canonicalTags.length > 0 && /rel\s*=\s*["']canonical["']/i.test(head),
    ogTitle: metaByName("og:title"),
    ogDescription: metaByName("og:description"),
    ogImage: metaByName("og:image"),
    twitterTitle: metaByName("twitter:title"),
    twitterDescription: metaByName("twitter:description"),
    hreflangs,
    h1: blocks(html, "h1").map(stripTags).filter(Boolean),
    h2: blocks(html, "h2").map(stripTags).filter(Boolean),
    jsonLd,
    jsonLdErrors,
    mainWordCount: countWords(mainText),
    mainText,
    internalLinks: [...internal].sort(),
    externalLinkCount,
    imagesWithoutAlt: images.filter((img) => attr(img, "alt") === null).length,
    imageCount: images.length,
  };
}

/** Podobieństwo Jaccarda na zbiorach 3-słowowych shingli (0–1). */
export function shingleSimilarity(a: string, b: string, size = 3): number {
  const shingles = (text: string) => {
    const words = text.toLowerCase().split(/\s+/).filter(Boolean);
    const set = new Set<string>();
    for (let i = 0; i + size <= words.length; i += 1) set.add(words.slice(i, i + size).join(" "));
    return set;
  };
  const sa = shingles(a);
  const sb = shingles(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let common = 0;
  for (const s of sa) if (sb.has(s)) common += 1;
  return common / (sa.size + sb.size - common);
}
