/**
 * Pozycja X logo i szerokość treści na głównych rodzinach tras.
 *
 * Osobne narzędzie od `layout-shots.ts`, bo odpowiada na jedno konkretne
 * pytanie i ma odpowiadać SZYBKO — bez zrzutów, bez przewijania, bez czekania
 * na leniwe obrazy. Zgłoszenie właściciela (2026-09-02):
 *
 *   „homepage x=32, hotels x=40, flights x=100, subpages x=160 — to jest
 *    wizualnie niespójne".
 *
 * Wyrównanie nagłówka i szerokość treści strony to DWIE NIEZALEŻNE rzeczy.
 * Logo ma stać w tym samym miejscu wszędzie; treść pod spodem może mieć
 * własną szerokość zależną od rodzaju strony.
 *
 * Uruchomienie (serwer musi już działać):
 *   npx tsx e2e/logo-x.ts              → 1920 px
 *   npx tsx e2e/logo-x.ts 390          → wybrana szerokość
 */
import { chromium } from "@playwright/test";

const BASE = process.env.SHOT_BASE ?? "http://localhost:3000";
const SZEROKOSC = Number(process.argv[2] ?? 1920);

const TRASY: { id: string; url: string }[] = [
  { id: "homepage", url: "/" },
  { id: "/kierunki", url: "/kierunki" },
  { id: "/inspiracje (pomysly na wyjazd)", url: "/inspiracje" },
  { id: "/city-breaki", url: "/city-breaki" },
  { id: "/regulamin", url: "/regulamin" },
  {
    id: "hotel results",
    url: "/hotele/szukaj?destination=Rodos&country=Grecja&checkin=2026-11-18&checkout=2026-11-25&adults=2&rooms=1",
  },
  { id: "flight results", url: "/loty/wyniki?origin=WAW&destination=BCN&depart=2026-09-15&adults=1" },
];

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: SZEROKOSC, height: SZEROKOSC < 768 ? 844 : 1080 },
    isMobile: SZEROKOSC < 768,
    hasTouch: SZEROKOSC < 768,
  });
  const page = await ctx.newPage();
  // tsx kompiluje z `keepNames`, więc nazwane funkcje w `page.evaluate`
  // wołają pomocnika `__name`, którego przeglądarka nie zna.
  await page.addInitScript({ content: "globalThis.__name = globalThis.__name || function (f) { return f; };" });
  await page.addInitScript({
    content: `try { localStorage.setItem("helptravel-cookie-consent-v1", JSON.stringify({ version: 1, decidedAt: 1767225600000, decision: { necessary: true, analytics: false, marketing: false } })); } catch (e) {}`,
  });

  console.log(`\nviewport ${SZEROKOSC} px\n`);
  console.log("trasa".padEnd(34) + "logo x".padStart(7) + "treść x".padStart(9) + "szer. treści".padStart(13));
  console.log("-".repeat(63));

  for (const t of TRASY) {
    try {
      await page.goto(BASE + t.url, { waitUntil: "domcontentloaded", timeout: 90_000 });
      await page.waitForTimeout(t.id.includes("hotel") ? 4500 : 1200);
      const w = await page.evaluate(() => {
        const logo = document.querySelector("header img") as HTMLElement | null;
        const main = document.querySelector("main") as HTMLElement | null;
        // Szerokość POWŁOKI treści, nie pudełka tła.
        //
        // Na hotelach i checkoucie `<main>` jest pełnoszerokościowym tłem
        // (`min-h-screen bg-neutral-50`), a limit siedzi na kontenerze
        // w środku — surowa szerokość `<main>` pokazywałaby tam 1920 px
        // i twierdziła, że hotele nie mają żadnego guttera.
        let powloka: HTMLElement | null = main;
        if (main && main.getBoundingClientRect().width >= window.innerWidth) {
          // `<main>` bez limitu — szukamy kontenera w środku. Próg 60 % okna
          // odsiewa zwykłe wyśrodkowane bloki (np. `mx-auto` na akapicie),
          // które nie są powłoką strony; bez niego homepage raportowała
          // 573 px „szerokości treści".
          for (const el of Array.from(main.querySelectorAll<HTMLElement>(".mx-auto"))) {
            const szer = el.getBoundingClientRect().width;
            if (szer >= window.innerWidth * 0.6 && szer < window.innerWidth) {
              if (!powloka || szer > powloka.getBoundingClientRect().width || powloka === main) powloka = el;
            }
          }
        }
        const r = powloka ? powloka.getBoundingClientRect() : null;
        const cs = powloka ? getComputedStyle(powloka) : null;
        // Treść liczona BEZ paddingu — inaczej „gutter" na telefonie wychodzi
        // zerowy, choć wizualnie jest tam 16 px odstępu od krawędzi.
        const tresc =
          r && cs ? r.width - parseFloat(cs.paddingLeft || "0") - parseFloat(cs.paddingRight || "0") : 0;
        return {
          logoX: logo ? Math.round(logo.getBoundingClientRect().x) : null,
          tresc: Math.round(tresc),
          trescX: r && cs ? Math.round(r.x + parseFloat(cs.paddingLeft || "0")) : null,
          okno: window.innerWidth,
        };
      });
      console.log(
        t.id.padEnd(34) + String(w.logoX).padStart(7) + String(w.trescX).padStart(9) + String(w.tresc).padStart(13),
      );
    } catch (err) {
      console.log(t.id.padEnd(34) + "  BŁĄD: " + (err as Error).message.split("\n")[0]);
    }
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
