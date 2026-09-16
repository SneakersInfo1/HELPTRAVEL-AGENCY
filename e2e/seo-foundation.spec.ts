/**
 * SEO GROWTH V1 — PR #1: fundament techniczny, sprawdzany na żywym wdrożeniu.
 *
 *   A — przeglądarka w en-US (jak renderer Google) dostaje lang="pl", zero linków /en i ?lang=
 *   B — ?lang= przekierowuje 301 na adres bez parametru
 *   C, F — tytuły bez kwot i bez roku w wyrenderowanym HTML
 *   E — JSON-LD przechodzi walidację; Offer tylko na stronie hotelu z realną ceną
 *   G — historyczne adresy: 301 na odpowiednik, który odpowiada 200
 *   H — sitemap: zero adresów 404, tylko ASCII, bez feed.xml
 *   J — dla UA Googlebota title, canonical i robots są w <head> także na stronach dynamicznych
 *   K — techniczne strony zakupu: noindex w <head> dla Googlebota, bez canonicala, poza sitemapą
 *
 * PR #1.5 — SEO Data Integrity:
 *   L — temperatura i czas lotu z szablonu regionu nie trafiają do title, H1 ani JSON-LD; dane kuratorowane zostają
 *   M — zbiór indeksowalnych stron miesięcy = zamrożona baza (sitemap i robots)
 *   N — bez dat bez źródła prawdy: JSON-LD, „Zaktualizowano", lastmod
 *   O — szacunek ze wzoru nie wygląda jak cena; bez „realnych danych", claimu wizowego i TouristAttraction z tagów
 *
 * Uruchamiane na Preview, nie na produkcji:
 *
 *   E2E_BASE=https://<deploy>.vercel.app E2E_SHARE=<token _vercel_share> npx playwright test seo-foundation --reporter=list
 *
 * Preview stoi za Vercel SSO. Token `_vercel_share` ustawia ciasteczko przy
 * pierwszym wejściu i traci ważność po każdym deployu — trzeba pobrać nowy.
 */
import { test, expect, type Page } from "@playwright/test";

import { CURRENT_INDEX_BASELINE } from "../src/lib/mvp/month-index-baseline";
import { validateJsonLd } from "../src/lib/seo/jsonld-validate";

const SHARE = process.env.E2E_SHARE?.trim();

const GOOGLEBOT_SMARTPHONE =
  "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.7258.127 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

// Szablony, które audyt zastał z błędami języka, tytułów lub JSON-LD.
const TEMPLATES = [
  "/",
  "/kierunki/malaga-spain",
  "/kierunki/malaga-spain/pazdziernik",
  "/kierunki/rome-italy/wrzesien",
  "/hotele/w/barcelona",
  "/inspiracje/europa-na-5-dni",
  "/porownanie/malaga-spain-vs-valencia-spain",
  "/najlepsze-kierunki/zima",
  "/tanie-podroze",
];

function warsawToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(new Date());
}

function isoPlusDays(days: number): string {
  const date = new Date(`${warsawToday()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Otwiera Preview z tokenem SSO, żeby kolejne zapytania kontekstu miały ciasteczko. */
async function authorize(page: Page) {
  if (SHARE) await page.goto(`/?_vercel_share=${encodeURIComponent(SHARE)}`, { waitUntil: "domcontentloaded" });
}

function pathOf(location: string | undefined): string {
  const url = new URL(location ?? "", "https://placeholder.invalid");
  return `${url.pathname}${url.search}`;
}

function jsonLdBlocks(html: string): unknown[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) =>
    JSON.parse(match[1]),
  );
}

test.describe("A — przeglądarka w en-US dostaje polski serwis", () => {
  test.use({ locale: "en-US", extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" } });

  for (const path of TEMPLATES) {
    test(`${path}: lang="pl", zero linków /en i ?lang=, bez błędu hydratacji`, async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("pageerror", (error) => errors.push(error.message));

      await authorize(page);
      await page.goto(path, { waitUntil: "load" });
      // Hydratacja i efekty klienta — to one przełączały język po załadowaniu.
      await page.waitForTimeout(2500);

      const state = await page.evaluate(() => ({
        lang: document.documentElement.lang,
        localeLinks: [...document.querySelectorAll("a[href]")]
          .map((anchor) => anchor.getAttribute("href") ?? "")
          .filter((href) => /^\/en(\/|$|\?)/.test(href) || /[?&]lang=/.test(href)),
      }));

      expect(state.lang, "A: <html lang> po hydratacji").toBe("pl");
      expect(state.localeLinks, "A: linki do wersji językowych").toEqual([]);
      expect(errors.filter((text) => /#418|hydrat/i.test(text)), "A: błędy hydratacji").toEqual([]);
    });
  }
});

test.describe("B — ?lang nie tworzy osobnego adresu", () => {
  test("/?lang=en → 301 na /", async ({ page }) => {
    await authorize(page);
    const response = await page.request.get("/?lang=en", { maxRedirects: 0 });
    expect(response.status()).toBe(301);
    expect(pathOf(response.headers().location)).toBe("/");
  });

  test("parametry kampanii zostają po usunięciu lang", async ({ page }) => {
    await authorize(page);
    const response = await page.request.get("/kierunki/malaga-spain?lang=en&utm_source=tiktok", { maxRedirects: 0 });
    expect(response.status()).toBe(301);
    expect(pathOf(response.headers().location)).toBe("/kierunki/malaga-spain?utm_source=tiktok");
  });
});

test.describe("G — historyczne adresy prowadzą na odpowiednik", () => {
  for (const [from, to] of [
    ["/porownanie/malaga-vs-valencia", "/porownanie/malaga-spain-vs-valencia-spain"],
    ["/tanie-podr%C3%B3%C5%BCe", "/tanie-podroze"],
  ] as const) {
    test(`${decodeURIComponent(from)} → 301 → ${to} (200)`, async ({ page }) => {
      await authorize(page);
      const redirect = await page.request.get(from, { maxRedirects: 0 });
      expect(redirect.status()).toBe(301);
      expect(pathOf(redirect.headers().location)).toBe(to);

      const target = await page.request.get(to, { maxRedirects: 0 });
      expect(target.status()).toBe(200);
    });
  }
});

test.describe("H — sitemap bez adresów 404", () => {
  test("każdy adres z sitemapy odpowiada 200, jest ASCII i jest stroną", async ({ page }) => {
    test.setTimeout(30 * 60_000);
    await authorize(page);

    const xml = await (await page.request.get("/sitemap.xml")).text();
    const locations = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    expect(locations.length).toBeGreaterThan(100);
    expect(locations.filter((loc) => /[^\x21-\x7e]/.test(loc) || loc.endsWith(".xml"))).toEqual([]);

    // Host w <loc> to adres gałęzi Preview; sprawdzamy ścieżki na wdrożeniu z E2E_BASE.
    const paths = locations.map((loc) => new URL(loc).pathname);
    const failures: string[] = [];
    const queue = [...paths];
    await Promise.all(
      Array.from({ length: 8 }, async () => {
        for (let path = queue.shift(); path !== undefined; path = queue.shift()) {
          const response = await page.request.get(path, { maxRedirects: 0, timeout: 60_000 });
          if (response.status() !== 200) failures.push(`${response.status()} ${path}`);
        }
      }),
    );
    expect(failures, `adresy z sitemapy bez 200 (${paths.length} sprawdzonych)`).toEqual([]);
  });
});

test.describe("C, E, F — tytuły i JSON-LD w wyrenderowanym HTML", () => {
  const hotelPath = `/hotele/lp3723e?checkin=${isoPlusDays(30)}&checkout=${isoPlusDays(33)}&adults=2&rooms=1`;

  for (const path of [...TEMPLATES, hotelPath]) {
    test(`${path}: tytuł bez kwoty i roku, JSON-LD bez uwag`, async ({ page }) => {
      await authorize(page);
      const html = await (await page.request.get(path)).text();
      const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";

      expect(title, "C/F: brak <title>").not.toBe("");
      expect(title, "F: rok w tytule").not.toMatch(/\b20\d{2}\b/);
      expect(title, "C: kwota w tytule").not.toMatch(/\d\s*zł/);

      const blocks = jsonLdBlocks(html);
      expect(blocks.length, "E: brak JSON-LD").toBeGreaterThan(0);
      expect(blocks.flatMap((block) => validateJsonLd(block, { todayIso: warsawToday() })), "E: uwagi walidatora").toEqual([]);
      if (path !== hotelPath) {
        expect(JSON.stringify(blocks), "E: Offer bez realnej oferty").not.toContain('"Offer"');
      }
    });
  }
});

test.describe("J — metadane w <head> dla Googlebota", () => {
  const cases = [
    {
      path: `/hotele/lp3723e?checkin=${isoPlusDays(30)}&checkout=${isoPlusDays(33)}&adults=2&rooms=1`,
      canonical: true,
    },
    { path: "/kierunki/malaga-spain/pazdziernik", canonical: true },
    { path: "/hotele/szukaj?destination=Barcelona&country=Spain", canonical: false },
  ];

  for (const { path, canonical } of cases) {
    test(`${path}: title${canonical ? ", canonical" : ""} i robots przed </head>`, async ({ page }) => {
      await authorize(page);
      const response = await page.request.get(path, { headers: { "user-agent": GOOGLEBOT_SMARTPHONE } });
      expect(response.status()).toBe(200);

      const html = await response.text();
      const headEnd = html.indexOf("</head>");
      expect(headEnd, "J: brak </head>").toBeGreaterThan(0);
      const head = html.slice(0, headEnd);

      const body = html.slice(headEnd);

      expect(head, "J: <title> poza <head>").toMatch(/<title>[^<]+<\/title>/);
      // Strona indeksowalna może nie mieć meta robots wcale (brak = index, follow).
      // Błędem jest tag robots albo canonical wyrenderowany dopiero w <body>.
      expect(body, "J: meta robots w <body>").not.toMatch(/<meta name="robots"/);
      expect(body, "J: canonical w <body>").not.toMatch(/<link rel="canonical"/);
      if (canonical) {
        expect(head, "J: canonical poza <head>").toMatch(/<link rel="canonical"/);
      } else {
        expect(head, "J: wyniki wyszukiwania mają noindex w <head>").toMatch(/<meta name="robots" content="noindex/);
      }
    });
  }
});

test.describe("K — techniczne strony zakupu: noindex dla Googlebota, bez canonicala, poza sitemapą", () => {
  // Same GET-y HTML bez parametrów i bez wykonywania JS. Bez `sid` strony powrotu
  // kończą na komunikacie o braku sesji, a /hotele/rezerwacja bez oferty — na
  // komunikacie o brakujących danych. Nic nie woła prebooka, płatności ani finalizacji.
  const PURCHASE_PAGES = [
    "/hotele/rezerwacja",
    "/hotele/rezerwacja/return",
    "/loty/dodatki",
    "/loty/pasazerowie",
    "/loty/platnosc",
    "/loty/platnosc/return",
    "/loty/potwierdzenie/test-seo-noindex",
  ];

  for (const path of PURCHASE_PAGES) {
    test(`${path}: noindex w <head>, bez canonicala`, async ({ page }) => {
      await authorize(page);
      const response = await page.request.get(path, {
        headers: { "user-agent": GOOGLEBOT_SMARTPHONE },
        maxRedirects: 0,
      });
      expect(response.status(), "K: status").toBe(200);

      const html = await response.text();
      const headEnd = html.indexOf("</head>");
      expect(headEnd, "K: brak </head>").toBeGreaterThan(0);

      const robots = html.slice(0, headEnd).match(/<meta name="robots" content="([^"]*)"/)?.[1] ?? "";
      expect(
        robots.split(",").map((token) => token.trim()),
        "K: noindex w <head>",
      ).toContain("noindex");
      // Tytuł-napis w layoucie kasował szablon „%s | HelpTravel” podstron (/loty/platnosc/return na Preview a3721a1).
      expect(html.slice(0, headEnd).match(/<title>([^<]*)<\/title>/)?.[1] ?? "", "K: tytuł bez marki").toContain("HelpTravel");
      expect(html.slice(headEnd), "K: meta robots w <body>").not.toMatch(/<meta name="robots"/);
      expect(html, "K: canonical na stronie zakupu").not.toMatch(/<link rel="canonical"/);
    });
  }

  test("sitemap.xml bez stron zakupu, robots.txt nie blokuje kroków lotu", async ({ page }) => {
    await authorize(page);
    const xml = await (await page.request.get("/sitemap.xml")).text();
    const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]).pathname);
    expect(paths.length).toBeGreaterThan(100);
    expect(
      paths.filter((path) => /^\/(hotele\/rezerwacja|loty\/(dodatki|pasazerowie|platnosc|potwierdzenie))(\/|$)/.test(path)),
      "K: strony zakupu w sitemapie",
    ).toEqual([]);

    // Zablokowanej strony Googlebot nie pobierze i nie zobaczy noindex.
    const robotsTxt = await (await page.request.get("/robots.txt")).text();
    const disallow = [...robotsTxt.matchAll(/^Disallow:\s*(\S+)/gim)].map((match) => match[1]);
    for (const path of PURCHASE_PAGES.filter((path) => path.startsWith("/loty/"))) {
      expect(
        disallow.filter((rule) => path.startsWith(rule)),
        `K: Disallow blokuje ${path}`,
      ).toEqual([]);
    }
  });
});

function mainHtml(html: string): string {
  return html.match(/<main\b[\s\S]*?<\/main>/)?.[0] ?? html;
}

function textOf(fragment: string): string {
  return fragment
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ");
}

function faqAnswers(blocks: unknown[]): string {
  return JSON.stringify(blocks).match(/"acceptedAnswer":\{[^}]*\}/g)?.join(" ") ?? "";
}

// Szacunek z odległości jest oznaczony w treści; w title, H1 i JSON-LD nie ma go wcale.
const HOURS = /\d[.,]\d\s?h\b/;

test.describe("L — fakty z szablonu regionu nie są prezentowane jako fakt", () => {
  const REGIONAL_TEMPERATURE = [
    "/kierunki/miami-united-states-of-america/grudzien",
    "/kierunki/alicante-spain/lipiec",
    "/kierunki/alicante-spain",
    "/kierunki/heraklion-greece",
    "/porownanie/heraklion-greece-vs-rhodes-greece",
    "/porownanie/heraklion-greece-vs-palma-spain",
    "/hotele/w/kreta",
  ];

  for (const path of REGIONAL_TEMPERATURE) {
    test(`${path}: bez °C i godzin lotu w title, H1 i JSON-LD`, async ({ page }) => {
      await authorize(page);
      const response = await page.request.get(path);
      expect(response.status()).toBe(200);
      const html = await response.text();
      const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
      const h1 = textOf(html.match(/<h1\b[\s\S]*?<\/h1>/)?.[0] ?? "");
      const ld = JSON.stringify(jsonLdBlocks(html));

      expect(title, "L: °C w title").not.toMatch(/°C/);
      expect(h1, "L: °C w H1").not.toMatch(/°C/);
      expect(ld, "L: °C w JSON-LD").not.toMatch(/°C/);
      expect(title, "L: godziny lotu w title").not.toMatch(HOURS);
      expect(ld, "L: godziny lotu w JSON-LD").not.toMatch(HOURS);
    });
  }

  test("/kierunki/miami-united-states-of-america/grudzien: bez FAQ z pogodą z szablonu", async ({ page }) => {
    await authorize(page);
    const html = await (await page.request.get("/kierunki/miami-united-states-of-america/grudzien")).text();
    expect(JSON.stringify(jsonLdBlocks(html))).not.toContain('"FAQPage"');
    expect(textOf(mainHtml(html)), "L: temperatura w treści").not.toMatch(/°C/);
  });

  test("/najlepsze-kierunki/lato: ranking bez kierunków z szablonu i bez Polski", async ({ page }) => {
    await authorize(page);
    const html = mainHtml(await (await page.request.get("/najlepsze-kierunki/lato")).text());
    for (const slug of ["gdansk-poland", "warsaw-poland", "krakow-poland", "alicante-spain", "palma-spain", "heraklion-greece"]) {
      expect(html, `L: ${slug} w rankingu`).not.toContain(`href="/kierunki/${slug}"`);
    }
  });

  test("dane kuratorowane nadal są faktem (test D)", async ({ page }) => {
    await authorize(page);
    const month = await (await page.request.get("/kierunki/malaga-spain/wrzesien")).text();
    expect(month.match(/<title>([^<]*)<\/title>/)?.[1] ?? "").toMatch(/Malaga we wrześniu: pogoda \d+°C/);
    expect(faqAnswers(jsonLdBlocks(month))).toMatch(/°C/);
    const guide = await (await page.request.get("/kierunki/malaga-spain")).text();
    expect(guide.match(/<title>([^<]*)<\/title>/)?.[1] ?? "").toMatch(/lot \d\.\d h/);
  });
});

test.describe("M — zbiór indeksowalnych stron miesięcy bez zmian", () => {
  const baselinePaths = Object.entries(CURRENT_INDEX_BASELINE)
    .flatMap(([slug, months]) => months.map((month) => `/kierunki/${slug}/${month}`))
    .sort();

  test("sitemap: dokładnie te same 1039 stron miesięcy co zamrożona baza", async ({ page }) => {
    await authorize(page);
    const xml = await (await page.request.get("/sitemap.xml")).text();
    const months = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
      .map((match) => new URL(match[1]).pathname)
      .filter((path) => /^\/kierunki\/[a-z0-9-]+\/[a-z]+$/.test(path))
      .sort();
    expect(months.length).toBe(1039);
    expect(months).toEqual(baselinePaths);
  });

  test("robots: zimowi kandydaci noindex, strony z bazy bez noindex", async ({ page }) => {
    await authorize(page);
    const robotsOf = async (path: string) => {
      const html = await (await page.request.get(path, { headers: { "user-agent": GOOGLEBOT_SMARTPHONE } })).text();
      return html.slice(0, html.indexOf("</head>")).match(/<meta name="robots" content="([^"]*)"/)?.[1] ?? "";
    };
    for (const path of ["/kierunki/alicante-spain/listopad", "/kierunki/bari-italy/styczen", "/kierunki/gdansk-poland/lipiec"]) {
      expect(await robotsOf(path), `M: ${path}`).toContain("noindex");
    }
    for (const path of ["/kierunki/malaga-spain/pazdziernik", "/kierunki/miami-united-states-of-america/grudzien", "/kierunki/alicante-spain/lipiec"]) {
      expect(baselinePaths, `M: ${path} w bazie`).toContain(path);
      expect(await robotsOf(path), `M: ${path}`).not.toContain("noindex");
    }
  });
});

test.describe("N — daty tylko ze źródłem prawdy", () => {
  for (const path of [...TEMPLATES, "/kierunki/alicante-spain", "/porownanie/heraklion-greece-vs-rhodes-greece", "/hotele/w/kreta"]) {
    test(`${path}: JSON-LD bez datePublished i dateModified, bez „Zaktualizowano"`, async ({ page }) => {
      await authorize(page);
      const html = await (await page.request.get(path)).text();
      const ld = JSON.stringify(jsonLdBlocks(html));
      expect(ld, "N: datePublished").not.toContain("datePublished");
      expect(ld, "N: dateModified").not.toContain("dateModified");
      expect(textOf(mainHtml(html)), "N: Zaktualizowano").not.toContain("Zaktualizowano");
    });
  }

  test("sitemap.xml bez <lastmod>", async ({ page }) => {
    await authorize(page);
    const xml = await (await page.request.get("/sitemap.xml")).text();
    expect(xml).not.toContain("<lastmod>");
  });
});

test.describe("O — szacunek nie udaje ceny, bez deklaracji bez pokrycia", () => {
  for (const path of ["/hotele/w/barcelona", "/hotele/w/kreta"]) {
    test(`${path}: bez „od X zł/noc" liczonego wzorem`, async ({ page }) => {
      await authorize(page);
      const main = textOf(mainHtml(await (await page.request.get(path)).text()));
      expect(main).not.toMatch(/od\s*\d[\d\s]*zł\s*\/\s*noc/);
    });
  }

  for (const path of ["/kierunki/malaga-spain", "/kierunki/alicante-spain", "/kierunki/heraklion-greece"]) {
    test(`${path}: bez „od X PLN / 2 os.", „realnych danych", claimu wizowego i TouristAttraction`, async ({ page }) => {
      await authorize(page);
      const html = await (await page.request.get(path)).text();
      const main = textOf(mainHtml(html));
      expect(main).not.toMatch(/od\s*\d[\d\s]*PLN\s*\/\s*2\s*os/);
      expect(main).not.toContain("Oparte na realnych danych");
      expect(main).not.toContain("bez wizy dla polskiego paszportu");
      expect(JSON.stringify(jsonLdBlocks(html))).not.toContain("TouristAttraction");
    });
  }

  // costIndex i accessScore profilu z szablonu to przeliczone stałe regionu (deriveCostIndex, deriveAccessScore).
  test("/kierunki/alicante-spain: bez indeksu kosztów, porównań cen i oceny dolotu z szablonu regionu", async ({ page }) => {
    await authorize(page);
    const html = await (await page.request.get("/kierunki/alicante-spain")).text();
    const main = textOf(mainHtml(html));
    const ld = JSON.stringify(jsonLdBlocks(html));
    expect(`${main} ${ld}`, "O: indeks kosztów").not.toMatch(/indeks\w* kosztów/i);
    expect(main, "O: porównanie cen z szablonu").not.toMatch(/zwykle taniej|(?:pułapie|pulapie) cenowym|średni budżet/);
    expect(main, "O: ocena dolotu z szablonu").not.toMatch(/łatwy dolot z Polski|warto dobrze ustawić tras|Dolot z Polski jest relatywnie prosty/);
  });

  test("/porownanie/heraklion-greece-vs-palma-spain: bez werdyktu budżetu i dolotu z szablonu", async ({ page }) => {
    await authorize(page);
    const html = await (await page.request.get("/porownanie/heraklion-greece-vs-palma-spain")).text();
    const main = textOf(mainHtml(html));
    expect(main, "O: budżet z szablonu").not.toMatch(/zwykle taniej|(?:pułapie|pulapie) cenowym/);
    expect(main, "O: dolot z szablonu").not.toMatch(/Dolot\/dostępność|łatwiejszy dolot|łatwiejszą i bardziej regularną logistykę/);
    expect(JSON.stringify(jsonLdBlocks(html)), "O: pytanie o ciepło bez danych o klimacie").not.toMatch(/cieplej/);
  });

  test("/kierunki/santa-cruz-de-tenerife-spain/styczen: temperatura bez cen i tłumów z heurystyki sezonu", async ({ page }) => {
    await authorize(page);
    const html = await (await page.request.get("/kierunki/santa-cruz-de-tenerife-spain/styczen")).text();
    const text = `${textOf(mainHtml(html))} ${JSON.stringify(jsonLdBlocks(html))}`;
    expect(text, "O: ceny i tłumy z heurystyki sezonu").not.toMatch(/najtaniej|ceny najniższe|najwyższe ceny|najwięcej turystów|najspokojniej/);
    expect(faqAnswers(jsonLdBlocks(html)), "D: temperatura z danych kuratorowanych").toMatch(/°C/);
  });
});

// P — twierdzenia jakościowe z ocen profilu (deriveScores = listy miast i region),
// metodologia redakcji i obietnica cen na landingu hoteli.
test.describe("P — oceny profilu z szablonu nie stają się twierdzeniem", () => {
  test("/kierunki/alicante-spain: bez odbiorców i touristType z ocen szablonu", async ({ page }) => {
    await authorize(page);
    const html = await (await page.request.get("/kierunki/alicante-spain")).text();
    const main = textOf(mainHtml(html));
    expect(JSON.stringify(jsonLdBlocks(html)), "P: touristType").not.toContain("touristType");
    expect(main, "P: odbiorcy z ocen").not.toMatch(
      /plażowicze szukający resetu|rodziny z dziecmi|fani klasycznych city breakow|planujacy z mysla o budżecie/,
    );
    expect(main, "P: oceny profilu w treści").not.toMatch(/profil plażowy \(\d|wewnętrznym scoringu|scoring zwiedzania/);
  });

  test("/porownanie/heraklion-greece-vs-rhodes-greece: bez werdyktu, odbiorców i FAQPage bez pokrycia", async ({ page }) => {
    await authorize(page);
    const html = await (await page.request.get("/porownanie/heraklion-greece-vs-rhodes-greece")).text();
    const main = textOf(mainHtml(html));
    expect(JSON.stringify(jsonLdBlocks(html)), "P: FAQPage bez pokrycia").not.toContain("FAQPage");
    expect(main, "P: sekcja dla kogo").not.toContain("Dla kogo lepszy będzie");
    expect(main, "P: werdykt z ocen").not.toMatch(/mocniejszy profil|mocniej wypada|lepszy będzie/);
  });

  test("/kierunki/naples-italy/styczen: chłodny miesiąc bez werdyktu o sezonie", async ({ page }) => {
    await authorize(page);
    const html = await (await page.request.get("/kierunki/naples-italy/styczen")).text();
    const text = `${textOf(mainHtml(html))} ${JSON.stringify(jsonLdBlocks(html))}`;
    expect(text, "P: poza sezonem").not.toContain("poza sezonem");
  });

  test("/redakcja: metodologia bez obietnicy realnych danych dla każdego przewodnika", async ({ page }) => {
    await authorize(page);
    const main = textOf(mainHtml(await (await page.request.get("/redakcja")).text()));
    expect(main, "P: claim metodologiczny").not.toMatch(
      /opiera na realnych danych|wieloletnich średnich klimatycznych|wieloletnie średnie pogodowe/,
    );
  });

  test("/hotele/w/kreta: bez obietnicy aktualnych cen na stronie", async ({ page }) => {
    await authorize(page);
    const main = textOf(mainHtml(await (await page.request.get("/hotele/w/kreta")).text()));
    expect(main, "P: aktualne ceny").not.toContain("aktualnymi cenami");
  });
});
