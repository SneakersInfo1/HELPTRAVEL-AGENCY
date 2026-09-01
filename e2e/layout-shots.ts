/**
 * Zrzuty + POMIARY powłoki serwisu (sitewide layout hardening, BEFORE/AFTER).
 *
 * To nie jest test — to narzędzie do oglądania i do liczb. Uruchamiane ręcznie:
 *   npx tsx e2e/layout-shots.ts before
 *   npx tsx e2e/layout-shots.ts after
 *
 * Zrzuty lądują w docs/layout-hardening/shots/<etykieta>/,
 * pomiary w docs/layout-hardening/shots/<etykieta>/pomiary.json.
 * Serwer musi już działać na :3000 (`pnpm dev` albo `pnpm start`).
 *
 * Dlaczego pomiary, a nie samo oko: brief §6 i §17 mówią o „niewykorzystanej
 * szerokości" i „ogromnych pustych połaciach". To są wielkości mierzalne
 * (szerokość treści / szerokość okna) i tylko w tej postaci da się uczciwie
 * pokazać, czy zmiana coś dała.
 */
import { chromium, type Browser, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.SHOT_BASE ?? "http://localhost:3000";
const LABEL = process.argv[2] ?? "before";
const OUT = join(process.cwd(), "docs", "layout-hardening", "shots", LABEL);

/** Termin daleko w przód — żeby dostępność nie zależała od dnia uruchomienia. */
const SEARCH =
  "/hotele/szukaj?destination=Rodos&country=Grecja&checkin=2026-11-18&checkout=2026-11-25&adults=2&rooms=1";
const HOTEL =
  "/hotele/lp2f045?destination=Rodos&country=Grecja&checkin=2026-11-18&checkout=2026-11-25&adults=2&rooms=1";

interface Strona {
  id: string;
  url: string;
  /** Ile czekać na dojście treści; wyniki hoteli potrzebują znacznie więcej. */
  osiadanie?: number;
  /** Strony transakcyjne pomijamy na mobile — nie o nich jest to zadanie. */
  tylkoDesktop?: boolean;
}

const STRONY: Strona[] = [
  { id: "a-homepage", url: "/" },
  { id: "b-hotele-wyniki", url: SEARCH, osiadanie: 9000 },
  { id: "c-hotel-detal", url: HOTEL, osiadanie: 6000 },
  { id: "d-kierunki", url: "/kierunki" },
  { id: "e-inspiracje", url: "/inspiracje" },
  { id: "f-city-breaki", url: "/city-breaki" },
  { id: "f2-wyjazdy-plaza", url: "/wyjazdy/plaza" },
  { id: "g-jak-pracujemy", url: "/jak-pracujemy" },
  { id: "h-regulamin", url: "/regulamin" },
  { id: "i-faq", url: "/faq" },
  { id: "j-o-nas", url: "/o-nas" },
  // Strony „krótkie" — na nich najlepiej widać białą dziurę przed stopką.
  { id: "k-polubione", url: "/polubione" },
  { id: "l-porownanie", url: "/porownanie" },
  { id: "m-mapa-serwisu", url: "/mapa-serwisu" },
  { id: "n-cennik", url: "/cennik" },
  { id: "o-kierunek", url: "/kierunki/barcelona-spain" },
  { id: "p-artykul", url: "/inspiracje/europa-na-5-dni" },
];

const VIEWPORTY = [
  { id: "1920x1080", width: 1920, height: 1080, mobilny: false },
  { id: "1440x900", width: 1440, height: 900, mobilny: false },
  { id: "768x1024", width: 768, height: 1024, mobilny: false },
  { id: "412x915", width: 412, height: 915, mobilny: true },
  { id: "390x844", width: 390, height: 844, mobilny: true },
  { id: "375x812", width: 375, height: 812, mobilny: true },
];

/** Viewporty, dla których robimy PEŁNE zrzuty (reszta to tylko pomiary). */
const ZRZUTY_DLA = new Set(["1920x1080", "1440x900", "390x844"]);

type Pomiar = Record<string, unknown>;

async function osiadz(page: Page, ms: number) {
  await page.waitForLoadState("domcontentloaded");
  // Leniwe obrazy dojeżdżają dopiero po przewinięciu — bez tego zrzut całej
  // strony łapie szare prostokąty zamiast kafli.
  await page.evaluate(async () => {
    const krok = window.innerHeight;
    for (let y = 0; y < document.body.scrollHeight; y += krok) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 90));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(ms);
}

/**
 * Wszystkie liczby, które opisują powłokę strony. Czytane JEDNYM przebiegiem
 * w przeglądarce, żeby nie łapać stanu z dwóch różnych momentów renderu.
 */
async function zmierz(page: Page): Promise<Pomiar> {
  return page.evaluate(() => {
    const okno = window.innerWidth;
    const el = (s: string) => document.querySelector(s) as HTMLElement | null;

    const opisz = (node: HTMLElement | null) => {
      if (!node) return null;
      const r = node.getBoundingClientRect();
      const cs = getComputedStyle(node);
      return {
        x: Math.round(r.x),
        szerokosc: Math.round(r.width),
        wysokosc: Math.round(r.height),
        promien: [
          cs.borderTopLeftRadius,
          cs.borderTopRightRadius,
          cs.borderBottomRightRadius,
          cs.borderBottomLeftRadius,
        ].join(" "),
        marginesy: `${cs.marginLeft} / ${cs.marginRight}`,
        maxSzer: cs.maxWidth,
        pozycja: cs.position,
      };
    };

    const header = el("header");
    const main = el("#main-content");
    const footer = el("footer");

    // Najszerszy realny blok treści wewnątrz main — po nim widać, ile
    // z ekranu strona faktycznie używa.
    let trescSzer = 0;
    if (main) {
      for (const kandydat of Array.from(main.querySelectorAll<HTMLElement>("section, .grid, article"))) {
        const w = kandydat.getBoundingClientRect().width;
        if (w > trescSzer && w <= okno) trescSzer = w;
      }
    }

    // Elementy wystające poza prawą krawędź — źródło poziomego przewijania.
    const winowajcy: string[] = [];
    if (document.documentElement.scrollWidth > okno + 1) {
      for (const node of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
        const r = node.getBoundingClientRect();
        if (r.width > 0 && r.right > okno + 1) {
          const opis = `${node.tagName.toLowerCase()}${node.className && typeof node.className === "string" ? "." + node.className.trim().split(/\s+/).slice(0, 3).join(".") : ""}`;
          if (!winowajcy.includes(opis)) winowajcy.push(opis);
          if (winowajcy.length >= 6) break;
        }
      }
    }

    return {
      okno,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      przewijaPoziomo: document.documentElement.scrollWidth > okno + 1,
      winowajcy,
      wysokoscDokumentu: Math.round(document.documentElement.scrollHeight),
      header: opisz(header),
      main: opisz(main),
      footer: opisz(footer),
      trescSzer: Math.round(trescSzer),
      // Ile procent ekranu jest pustym marginesem po bokach treści.
      pustkaProc: trescSzer ? Math.round(((okno - trescSzer) / okno) * 1000) / 10 : null,
      // „Biała dziura" przed stopką.
      //
      // NIE liczona od pudełek. Pierwsza wersja brała `getBoundingClientRect`
      // dowolnego elementu i pokazywała stałe 32 px na każdej stronie — bo
      // `#main-content` ma `flex-1`, a strony w rodzaju /polubione mają
      // `min-h-screen` na własnym `<main>`, więc PUDEŁKO zawsze dociąga do
      // stopki. Ta pusta przestrzeń jest właśnie w środku pudełka.
      //
      // Liczymy więc od dołu ostatniego elementu, który coś RYSUJE: ma własny
      // tekst albo jest obrazem. To jest „dno atramentu" strony.
      lukaPrzedStopka: (() => {
        if (!main || !footer) return null;
        let dol = main.getBoundingClientRect().top;
        for (const node of Array.from(main.querySelectorAll<HTMLElement>("*"))) {
          const rysuje =
            ["IMG", "SVG", "CANVAS", "VIDEO"].includes(node.tagName) ||
            Array.from(node.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim().length > 0);
          if (!rysuje) continue;
          // ZAMKNIĘTE `<details>`: Chromium NIE maluje ich zawartości, ale
          // `getBoundingClientRect` i tak zwraca dla niej pudełko z układu.
          // Bez tego wyjątku strony z akordeonem FAQ (landingi /wyjazdy/*)
          // raportowały UJEMNĄ lukę przed stopką — pomiar mówił, że odpowiedź
          // nachodzi na stopkę, a na zrzucie ekranu nie było jej w ogóle.
          const zwiniete = node.closest("details");
          if (zwiniete && !zwiniete.open && !zwiniete.querySelector("summary")?.contains(node)) continue;
          const r = node.getBoundingClientRect();
          if (r.height > 0 && r.width > 0 && r.bottom > dol) dol = r.bottom;
        }
        return Math.round(footer.getBoundingClientRect().top - dol);
      })(),
    };
  });
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser: Browser = await chromium.launch();
  const wyniki: Record<string, Pomiar> = {};

  for (const vp of VIEWPORTY) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
      isMobile: vp.mobilny,
      hasTouch: vp.mobilny,
    });
    const page = await ctx.newPage();
    // PUŁAPKA tsx + Playwright: esbuild kompiluje z `keepNames`, więc każda
    // NAZWANA funkcja wewnątrz `page.evaluate` dostaje wywołanie pomocnika
    // `__name(...)`. Pomocnik istnieje w Node, nie w przeglądarce — bez tego
    // shimu każdy pomiar wywala się na `ReferenceError: __name is not defined`.
    await page.addInitScript({ content: "globalThis.__name = globalThis.__name || function (f) { return f; };" });
    // Zgoda na cookies wstawiona z góry — baner zgód zasłania pół ekranu
    // i każdy zrzut „before" byłby o nim, a nie o układzie strony.
    // Klucz i kształt rekordu: src/lib/consent/types.ts.
    await page.addInitScript({
      content: `try { localStorage.setItem("helptravel-cookie-consent-v1", JSON.stringify({ version: 1, decidedAt: 1767225600000, decision: { necessary: true, analytics: false, marketing: false } })); } catch (e) {}`,
    });
    console.log(`\n[${LABEL}] ${vp.id}`);

    for (const s of STRONY) {
      if (s.tylkoDesktop && vp.mobilny) continue;
      try {
        await page.goto(BASE + s.url, { waitUntil: "domcontentloaded", timeout: 60_000 });
        await osiadz(page, s.osiadanie ?? 1400);
        const pomiar = await zmierz(page);
        wyniki[`${s.id}@${vp.id}`] = pomiar;

        if (ZRZUTY_DLA.has(vp.id)) {
          const dir = join(OUT, vp.id);
          mkdirSync(dir, { recursive: true });
          await page.screenshot({ path: join(dir, `${s.id}.png`), fullPage: false });
          await page.screenshot({ path: join(dir, `${s.id}-cala.png`), fullPage: true });
        }
        const p = pomiar as { trescSzer: number; pustkaProc: number | null; przewijaPoziomo: boolean };
        console.log(
          `  ✓ ${s.id.padEnd(20)} tresc ${String(p.trescSzer).padStart(4)} px · pustka ${String(p.pustkaProc).padStart(5)}%${p.przewijaPoziomo ? "  ⚠ POZIOMY SCROLL" : ""}`,
        );
      } catch (err) {
        console.log(`  ✗ ${s.id}: ${(err as Error).message.split("\n")[0]}`);
        wyniki[`${s.id}@${vp.id}`] = { blad: (err as Error).message.split("\n")[0] };
      }
    }
    await ctx.close();
  }

  writeFileSync(join(OUT, "pomiary.json"), JSON.stringify(wyniki, null, 2), "utf8");
  console.log(`\nPomiary → ${join(OUT, "pomiary.json")}`);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
