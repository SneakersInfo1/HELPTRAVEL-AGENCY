/**
 * Szerokość treści, gutter i REALNA SZEROKOŚĆ KARTY na kolejnych viewportach.
 *
 * Powstało po pomyłce, którą warto pamiętać (2026-09-02). Raport twierdził, że
 * `max-w-[2000px]` „na 1920 i 2560 nie daje o sobie znać". Na 2560 daje:
 * 2560 − 2000 = 560 px, czyli 280 px marginesu z każdej strony — dokładnie ten
 * centralny box, który mieliśmy usunąć. Testy tego nie złapały, bo mierzyły
 * WYŁĄCZNIE 1920 i sprawdzały próg bezwzględny (≥1800 px), który 2000 spełnia.
 *
 * Stąd dwie zasady wbudowane w to narzędzie:
 *   • mierzymy szerokość WZGLĘDEM viewportu (gutter), nie wartością absolutną;
 *   • mierzymy też szerokość pojedynczej karty, bo „pełna szerokość" osiągnięta
 *     kartami po 900 px nie jest sukcesem.
 *
 * Uruchomienie (serwer musi już działać):
 *   npx tsx e2e/szerokosci.ts
 */
import { chromium } from "@playwright/test";

const BASE = process.env.SHOT_BASE ?? "http://localhost:3000";

const VIEWPORTY = [
  { w: 1440, h: 900 },
  { w: 1920, h: 1080 },
  { w: 2560, h: 1440 },
  { w: 3840, h: 2160 },
];

const TRASY = [
  { id: "/kierunki", url: "/kierunki" },
  { id: "/inspiracje", url: "/inspiracje" },
  { id: "/city-breaki", url: "/city-breaki" },
  {
    id: "hotel results",
    url: "/hotele/szukaj?destination=Rodos&country=Grecja&checkin=2026-11-18&checkout=2026-11-25&adults=2&rooms=1",
  },
];

async function main() {
  const browser = await chromium.launch();

  for (const vp of VIEWPORTY) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    const page = await ctx.newPage();
    await page.addInitScript({ content: "globalThis.__name = globalThis.__name || function (f) { return f; };" });
    await page.addInitScript({
      content: `try { localStorage.setItem("helptravel-cookie-consent-v1", JSON.stringify({ version: 1, decidedAt: 1767225600000, decision: { necessary: true, analytics: false, marketing: false } })); } catch (e) {}`,
    });

    console.log(`\n═══ viewport ${vp.w} × ${vp.h} ═══`);
    console.log(
      "trasa".padEnd(16) +
        "logo x".padStart(7) +
        "treść".padStart(7) +
        "gutter".padStart(8) +
        "  % okna" +
        "   najszersze siatki (kolumny × szerokość karty)",
    );

    for (const t of TRASY) {
      try {
        await page.goto(BASE + t.url, { waitUntil: "domcontentloaded", timeout: 90_000 });
        await page.waitForTimeout(t.id.includes("hotel") ? 4500 : 1400);

        const m = await page.evaluate(() => {
          const logo = document.querySelector("header img") as HTMLElement | null;
          const main = document.querySelector("main") as HTMLElement | null;

          // Powłoka treści: `<main>` z własnym limitem, albo — gdy `<main>`
          // jest tylko pełnoszerokościowym tłem (hotele) — kontener w środku.
          let powloka: HTMLElement | null = main;
          if (main && main.getBoundingClientRect().width >= window.innerWidth) {
            for (const el of Array.from(main.querySelectorAll<HTMLElement>(".mx-auto"))) {
              const szer = el.getBoundingClientRect().width;
              if (szer >= window.innerWidth * 0.5 && szer < window.innerWidth) {
                if (powloka === main || szer > powloka!.getBoundingClientRect().width) powloka = el;
              }
            }
          }
          const r = powloka ? powloka.getBoundingClientRect() : null;
          const cs = powloka ? getComputedStyle(powloka) : null;
          const tresc = r && cs ? r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) : 0;
          const lewy = r && cs ? r.x + parseFloat(cs.paddingLeft) : 0;

          // Siatki kart: liczba kolumn (najliczniejszy rząd) i szerokość karty.
          const siatki: { kol: number; karta: number; n: number }[] = [];
          const kandydaci = Array.from(
            document.querySelectorAll<HTMLElement>("main .ht-karty, main .grid"),
          );
          for (const g of kandydaci) {
            const dzieci = Array.from(g.children).filter((c) => c.getBoundingClientRect().width > 0);
            if (dzieci.length < 3) continue;
            const wRzedzie = new Map<number, number>();
            for (const c of dzieci) {
              const gora = Math.round(c.getBoundingClientRect().top);
              wRzedzie.set(gora, (wRzedzie.get(gora) ?? 0) + 1);
            }
            const kol = Math.max(...wRzedzie.values());
            const karta = Math.round(dzieci[0].getBoundingClientRect().width);
            siatki.push({ kol, karta, n: dzieci.length });
          }
          // Najszersze karty na wierzchu — to one psują wygląd.
          siatki.sort((a, b) => b.karta - a.karta);

          return {
            logoX: logo ? Math.round(logo.getBoundingClientRect().x) : null,
            tresc: Math.round(tresc),
            gutter: Math.round(lewy),
            okno: window.innerWidth,
            scrollW: document.documentElement.scrollWidth,
            siatki: siatki.slice(0, 3),
          };
        });

        const proc = Math.round((m.tresc / m.okno) * 1000) / 10;
        const opisSiatek = m.siatki.map((s) => `${s.kol}×${s.karta}px(n=${s.n})`).join("  ");
        console.log(
          t.id.padEnd(16) +
            String(m.logoX).padStart(7) +
            String(m.tresc).padStart(7) +
            String(m.gutter).padStart(8) +
            `  ${String(proc).padStart(5)}%` +
            (m.scrollW > m.okno + 1 ? "  ⚠SCROLL" : "") +
            "   " +
            opisSiatek,
        );
      } catch (err) {
        console.log(t.id.padEnd(16) + "  BŁĄD: " + (err as Error).message.split("\n")[0]);
      }
    }
    await ctx.close();
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
