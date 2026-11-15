// Test dymny SEO po buildzie albo na Preview — bez przeglądarki, na surowym HTML.
//
//   pnpm seo:smoke -- --base http://localhost:3000
//   pnpm seo:smoke -- --base https://<preview>.vercel.app --share <token _vercel_share>
//
// Sprawdza reprezentatywne adresy trzech szablonów i stron pokrewnych:
// status, język, jeden <title> w <head>, długość tytułu, opis, canonical na
// siebie, robots zgodne z polityką, jeden H1, poprawny JSON-LD (walidator
// z lib/seo/jsonld-validate.ts), og:image i karta Twittera z tytułem strony,
// treść widoczna w HTML serwera (bez czekania na JavaScript). Do tego
// przekierowania, prawdziwe 404, trasa laboratoryjna, sitemap i robots.txt.
//
// Nie dotyka wyszukiwarki, kart hoteli, lotów ani API. Kod wyjścia 1 przy
// jakimkolwiek błędzie; raport JSON w --out.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { isMonthPageIndexableBySlug } from "../../src/lib/mvp/month-index-policy";
import { auditHtml } from "../../src/lib/seo-ops/html-audit";
import { validateJsonLd } from "../../src/lib/seo/jsonld-validate";

function arg(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const BASE = (arg("base", "http://localhost:3000") ?? "").replace(/\/$/, "");
const SHARE = arg("share");
const OUT = arg("out", "seo-private/smoke/latest.json")!;
const SITE_URL = arg("site", "https://helptravel.pl")!;
const TODAY = new Date().toISOString().slice(0, 10);

interface PageCase {
  path: string;
  template: "comparison" | "month" | "hub" | "guide" | "article" | "city" | "index" | "home";
  /** Strona ma dokument treści ze źródłami. */
  enriched?: boolean;
  minWords: number;
}

const PAGES: PageCase[] = [
  { path: "/porownanie/athens-greece-vs-rome-italy", template: "comparison", enriched: true, minWords: 900 },
  { path: "/porownanie/funchal-portugal-vs-santa-cruz-de-tenerife-spain", template: "comparison", enriched: true, minWords: 900 },
  { path: "/porownanie/malaga-spain-vs-valencia-spain", template: "comparison", enriched: true, minWords: 900 },
  { path: "/porownanie/barcelona-spain-vs-valencia-spain", template: "comparison", enriched: true, minWords: 800 },
  // Para flagowa: na produkcji ma też sekcję danych własnych z LiteAPI; lokalnie bez kluczy jej nie ma.
  { path: "/porownanie/heraklion-greece-vs-rhodes-greece", template: "comparison", minWords: 250 },
  { path: "/kierunki/barcelona-spain/styczen", template: "month", minWords: 250 },
  { path: "/kierunki/barcelona-spain/listopad", template: "month", minWords: 250 },
  { path: "/kierunki/malaga-spain/luty", template: "month", minWords: 250 },
  { path: "/kierunki/marrakesh-morocco/styczen", template: "month", minWords: 200 },
  { path: "/kierunki/alicante-spain/czerwiec", template: "month", minWords: 120 },
  { path: "/wyjazdy/city-break", template: "hub", minWords: 500 },
  { path: "/wyjazdy/budzet", template: "hub", minWords: 500 },
  { path: "/kierunki/barcelona-spain", template: "guide", minWords: 600 },
  { path: "/inspiracje/gdzie-poleciec-w-maju", template: "article", minWords: 300 },
  { path: "/hotele/w/barcelona", template: "city", minWords: 300 },
  { path: "/porownanie", template: "index", minWords: 300 },
];

const REDIRECTS: Array<{ path: string; status: number; location: string }> = [
  { path: "/por%C3%B3wnanie/athens-greece-vs-rome-italy", status: 301, location: "/porownanie/athens-greece-vs-rome-italy" },
  { path: "/porunanie/heraklion-greece-vs-rhodes-greece", status: 301, location: "/porownanie/heraklion-greece-vs-rhodes-greece" },
  { path: "/porownanie/malaga-vs-valencia", status: 301, location: "/porownanie/malaga-spain-vs-valencia-spain" },
  { path: "/porownanie/athens-greece-vs-rome-italy?lang=en", status: 301, location: "/porownanie/athens-greece-vs-rome-italy" },
  { path: "/en/kierunki/barcelona-spain", status: 308, location: "/kierunki/barcelona-spain" },
];

const NOT_FOUND = [
  "/porownanie/nie-ma-takiej-pary",
  "/por%C3%B3wnanie/nie-ma-takiej-pary",
  "/kierunki/barcelona-spain/smarch",
  "/lab/porownanie/werdykt/athens-greece-vs-rome-italy",
];

/** Tytuł karty Twittera dziedziczony z layoutu — strona treści nie może go mieć. */
const SITE_DEFAULT_TWITTER = "HelpTravel — hotele i loty w jednym miejscu";

interface Result {
  check: string;
  path: string;
  ok: boolean;
  detail: string;
}

const results: Result[] = [];
const record = (check: string, path: string, ok: boolean, detail = "") => results.push({ check, path, ok, detail });

// Preview na Vercelu: token `_vercel_share` w adresie daje 307 z ciasteczkiem dostępu.
// Wymieniamy go raz na ciasteczko i dalej pytamy o czyste adresy — z tokenem w każdym
// żądaniu test sprawdzałby przekierowanie Vercela, a nie stronę (27/27 fałszywych 307).
let accessCookie: string | null = null;

async function exchangeShareToken(): Promise<void> {
  if (!SHARE) return;
  const url = new URL(`${BASE}/robots.txt`);
  url.searchParams.set("_vercel_share", SHARE);
  const response = await fetch(url, { redirect: "manual" });
  const cookies = response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).filter(Boolean);
  if (cookies.length === 0) {
    throw new Error(`Token _vercel_share nie dał ciasteczka dostępu (status ${response.status}). Token traci ważność po każdym wdrożeniu.`);
  }
  accessCookie = cookies.join("; ");
}

async function get(path: string, redirect: RequestRedirect = "manual"): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    redirect,
    headers: {
      "user-agent": "HelpTravelSeoSmoke/1.0",
      accept: "text/html",
      "accept-language": "pl-PL",
      ...(accessCookie ? { cookie: accessCookie } : {}),
    },
  });
}

async function checkPage(page: PageCase) {
  const response = await get(page.path);
  record("status 200", page.path, response.status === 200, String(response.status));
  if (response.status !== 200) return;
  const html = await response.text();
  const audit = auditHtml(html, `${BASE}${page.path}`);
  const canonicalPath = audit.canonicals[0] ? new URL(audit.canonicals[0], SITE_URL).pathname : "";
  const robots = audit.metaRobots ?? "";
  const monthMatch = /^\/kierunki\/([^/]+)\/([^/]+)$/.exec(page.path);
  const expectNoindex = monthMatch ? !isMonthPageIndexableBySlug(monthMatch[1], monthMatch[2]) : false;

  record("lang=pl", page.path, audit.lang === "pl", String(audit.lang));
  record("jeden <title> w <head>", page.path, audit.titles.length === 1 && audit.titleInHead, `${audit.titles.length}`);
  const title = audit.titles[0] ?? "";
  // Limit liczony bez sufiksu marki: jeśli wynik wyszukiwania utnie tytuł, to
  // właśnie na „| HelpTravel", a nie na treści.
  const bare = title.replace(/ \| HelpTravel$/, "");
  record("tytuł ≤ 60 znaków bez sufiksu marki", page.path, bare.length > 10 && bare.length <= 60, `${bare.length}: ${title}`);
  if (page.template === "month") {
    record("strona miesiąca: tytuł bez sufiksu marki", page.path, title === bare, title);
  }
  const description = audit.metaDescription ?? "";
  record("opis 50–170 znaków", page.path, description.length >= 50 && description.length <= 170, `${description.length}`);
  record("canonical na siebie", page.path, audit.canonicals.length === 1 && audit.canonicalInHead && canonicalPath === page.path, audit.canonicals.join(" "));
  record(
    expectNoindex ? "robots: noindex, follow" : "robots: indeksowalna",
    page.path,
    expectNoindex ? /noindex/.test(robots) && /follow/.test(robots) : !/noindex/.test(robots),
    robots || "(brak)",
  );
  record("dokładnie jeden H1", page.path, audit.h1.length === 1, audit.h1.join(" | "));
  record("JSON-LD parsuje się", page.path, audit.jsonLdErrors === 0 && audit.jsonLd.length > 0, `${audit.jsonLd.length} bloków`);
  const issues = audit.jsonLd.flatMap((block) => validateJsonLd(block.raw, { todayIso: TODAY }));
  record("JSON-LD bez uwag walidatora", page.path, issues.length === 0, issues.map((issue) => `${issue.type}: ${issue.message}`).join("; "));
  record("og:image", page.path, Boolean(audit.ogImage), audit.ogImage ?? "");
  record(
    "karta Twittera z tytułem strony",
    page.path,
    Boolean(audit.twitterTitle) && audit.twitterTitle !== SITE_DEFAULT_TWITTER,
    audit.twitterTitle ?? "(brak)",
  );
  record(`treść w HTML serwera ≥ ${page.minWords} słów`, page.path, audit.mainWordCount >= page.minWords, String(audit.mainWordCount));
  if (page.enriched) {
    const types = new Set(audit.jsonLd.flatMap((block) => block.types));
    record("dokument treści: źródła na stronie", page.path, /Źródła i sposób pracy/.test(audit.mainText), "");
    record("dokument treści: Article z dateModified", page.path, types.has("Article") && html.includes('"dateModified"'), "");
  }
  // FAQPage wyłącznie z pytaniami widocznymi na stronie.
  const faqQuestions = audit.jsonLd
    .flatMap((block) => JSON.stringify(block.raw).match(/"@type":"Question","name":"([^"]+)"/g) ?? [])
    .map((match) => match.replace(/^"@type":"Question","name":"/, "").replace(/"$/, ""));
  const invisible = faqQuestions.filter((question) => !audit.mainText.includes(question));
  record("FAQPage tylko z widocznych pytań", page.path, invisible.length === 0, invisible.slice(0, 3).join(" | "));
  // Linki wewnętrzne z treści do kroków zakupu — zakazane.
  const purchase = audit.internalLinks.filter((link) => /^\/(hotele\/rezerwacja|loty\/(pasazerowie|platnosc|dodatki|potwierdzenie)|api\/)/.test(link));
  record("brak linków do kroków zakupu i API", page.path, purchase.length === 0, purchase.join(" "));
}

async function checkRedirect(item: (typeof REDIRECTS)[number]) {
  const response = await get(item.path);
  const location = response.headers.get("location") ?? "";
  const target = location ? new URL(location, BASE) : null;
  const ok = response.status === item.status && target?.pathname === item.location && !target.searchParams.has("lang");
  record(`przekierowanie ${item.status}`, item.path, ok, `${response.status} → ${location}`);
}

async function checkNotFound(path: string) {
  const response = await get(path);
  record("prawdziwe 404", path, response.status === 404, String(response.status));
}

async function checkSitemap() {
  const response = await get("/sitemap.xml");
  record("sitemap.xml 200", "/sitemap.xml", response.status === 200, String(response.status));
  if (response.status !== 200) return;
  const xml = await response.text();
  const entries = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => ({
    loc: /<loc>([^<]+)<\/loc>/.exec(m[1])?.[1] ?? "",
    lastmod: /<lastmod>([^<]+)<\/lastmod>/.exec(m[1])?.[1] ?? null,
  }));
  const paths = entries.map((entry) => new URL(entry.loc).pathname);
  record("sitemap: adresy kanoniczne", "/sitemap.xml", entries.every((entry) => entry.loc.startsWith(SITE_URL)), `${entries.length} adresów`);
  record("sitemap: bez wyszukiwarki, zakupu, /lab i /en", "/sitemap.xml", !paths.some((p) => /^\/(hotele\/szukaj|hotele\/rezerwacja|loty\/|lab\/|en\/|api\/)/.test(p)), "");
  const dated = entries.filter((entry) => entry.lastmod);
  record(
    "sitemap: lastmod tylko przy dokumentach treści",
    "/sitemap.xml",
    dated.length >= 4 && dated.every((entry) => new URL(entry.loc).pathname.startsWith("/porownanie/")),
    dated.map((entry) => `${new URL(entry.loc).pathname} ${entry.lastmod}`).join("; "),
  );
  record("sitemap: brak duplikatów", "/sitemap.xml", new Set(paths).size === paths.length, "");
}

async function checkRobots() {
  const response = await get("/robots.txt");
  const text = await response.text();
  record("robots.txt", "/robots.txt", response.status === 200 && /Disallow: \/api\//.test(text) && /Disallow: \/hotele\/szukaj/.test(text) && /Sitemap:/.test(text), String(response.status));
}

async function main() {
  await exchangeShareToken();
  for (const page of PAGES) await checkPage(page);
  for (const item of REDIRECTS) await checkRedirect(item);
  for (const path of NOT_FOUND) await checkNotFound(path);
  await checkSitemap();
  await checkRobots();

  const failed = results.filter((result) => !result.ok);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify({ base: BASE, checkedAt: new Date().toISOString(), total: results.length, failed: failed.length, results }, null, 2)}\n`, "utf8");
  for (const result of failed) console.log(`✖ ${result.check} — ${result.path} — ${result.detail}`);
  console.log(`${results.length - failed.length}/${results.length} sprawdzeń OK (${BASE})`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
