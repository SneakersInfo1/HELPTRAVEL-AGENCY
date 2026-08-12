/**
 * POMIAR + REGRESJA: lejek cen na listingu (brief §24).
 *
 * Uderza w ŻYWE LiteAPI, więc trwa kilkanaście minut i nie nadaje się do
 * ciągłej integracji — to narzędzie do świadomego przebiegu przed wdrożeniem.
 * Uruchamiać na produkcyjnym buildzie (`pnpm build && pnpm start`).
 *
 * Kryterium, które musi przejść: NIE ISTNIEJE przebieg, w którym są wyniki,
 * nie ma ani jednej ceny, a strona zachowuje się tak, jakby wszystko było
 * w porządku („Brak dostępnych hoteli w tym terminie" po awarii zapytań).
 * To był realny scenariusz produkcyjny: cała paczka wracała 429, wszystkie
 * ponowki wpadały w to samo okno limitera i lista ogłaszała brak hoteli.
 */
import { test, expect, type Page } from "@playwright/test";

const KIERUNKI = [
  { destination: "Budapest", country: "Węgry" },
  { destination: "Barcelona", country: "Hiszpania" },
  { destination: "Rome", country: "Włochy" },
  { destination: "Rhodes", country: "Grecja" },
  { destination: "Heraklion", country: "Grecja" },
  { destination: "Antalya", country: "Turcja" },
];

/** Pięć terminów × sześć kierunków = 30 wyszukiwań. */
const TERMINY = [
  { checkin: "2026-09-15", checkout: "2026-09-17" },
  { checkin: "2026-09-22", checkout: "2026-09-25" },
  { checkin: "2026-10-06", checkout: "2026-10-09" },
  { checkin: "2026-10-20", checkout: "2026-10-23" },
  { checkin: "2026-11-10", checkout: "2026-11-13" },
];

async function dismissCookies(page: Page) {
  const btn = page.getByRole("button", { name: /Tylko niezbędne|Akceptuję wszystkie/ }).first();
  if (await btn.isVisible().catch(() => false)) await btn.click();
}

test.describe("lejek cen — obciążenie", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(60 * 60_000);

  test("30 wyszukiwan: awaria zapytan nigdy nie udaje braku hoteli", async ({ page }) => {
    const raport: string[] = [];
    const globalne = { req: 0, r429: 0, r5xx: 0, r4xx: 0, inne: 0 };
    let biezace = { req: 0, r429: 0, r5xx: 0, r4xx: 0 };

    page.on("response", (res) => {
      if (!res.url().includes("/api/hotels/")) return;
      const s = res.status();
      globalne.req++;
      biezace.req++;
      if (s === 429) {
        globalne.r429++;
        biezace.r429++;
      } else if (s >= 500) {
        globalne.r5xx++;
        biezace.r5xx++;
      } else if (s >= 400) {
        globalne.r4xx++;
        biezace.r4xx++;
      } else if (s !== 200) globalne.inne++;
    });

    let falszywySukces = 0;

    for (const [i, termin] of TERMINY.entries()) {
      for (const k of KIERUNKI) {
        biezace = { req: 0, r429: 0, r5xx: 0, r4xx: 0 };
        const start = Date.now();
        const url =
          `/hotele/szukaj?destination=${encodeURIComponent(k.destination)}` +
          `&country=${encodeURIComponent(k.country)}` +
          `&checkin=${termin.checkin}&checkout=${termin.checkout}&adults=2&rooms=1`;
        await page.goto(url);
        await dismissCookies(page);
        await expect(page.getByText(/Szukamy najlepszych ofert/)).toBeHidden({ timeout: 120_000 });
        await page.waitForTimeout(400);

        const stan = await page.evaluate(() => {
          const txt = (document.querySelector("main") as HTMLElement | null)?.innerText ?? "";
          return {
            karty: document.querySelectorAll('a[href^="/hotele/"]').length,
            bezMiejsc: txt.includes("Brak dostępnych hoteli w tym terminie"),
            awaria: txt.includes("Nie udało się sprawdzić"),
            czesciowa: txt.includes("Nie udało się sprawdzić cen części obiektów"),
            // Liczba „N obiektów" z podtytułu = ile hoteli ma potwierdzoną cenę.
            wycenione: Number(/(\d+)\s+(obiekt|obiekty|obiektów)/.exec(txt)?.[1] ?? "0"),
          };
        });

        // FAŁSZYWY SUKCES = zero cen + neutralny komunikat „brak hoteli",
        // mimo że zapytania realnie padały.
        const falszywy =
          stan.wycenione === 0 && stan.bezMiejsc && biezace.r429 + biezace.r5xx + biezace.r4xx > 0;
        if (falszywy) falszywySukces++;

        raport.push(
          `${String(i * KIERUNKI.length + KIERUNKI.indexOf(k) + 1).padStart(2)} ${k.destination.padEnd(10)} ${termin.checkin}` +
            ` karty=${String(stan.karty).padStart(3)} wycenione=${String(stan.wycenione).padStart(4)}` +
            ` req=${String(biezace.req).padStart(3)} 429=${biezace.r429} 5xx=${biezace.r5xx} 4xx=${biezace.r4xx}` +
            ` czesciowa=${stan.czesciowa ? "TAK" : "nie"} awaria=${stan.awaria ? "TAK" : "nie"}` +
            ` ${Date.now() - start}ms${falszywy ? "  <<< FALSZYWY SUKCES" : ""}`,
        );
      }
    }

    console.log("\n===== LEJEK CEN — 30 WYSZUKIWAŃ =====");
    console.log(raport.join("\n"));
    console.log("RAZEM:", JSON.stringify(globalne));
    console.log("=====================================\n");

    expect(falszywySukces, "awaria zapytań nie może udawać braku hoteli").toBe(0);
  });
});
