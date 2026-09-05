// POMIAR UX NA ŻYWO — przez PRAWDZIWY interfejs, nie przez harness.
//
// Harness benchmarkowy mierzy sam model (narzędzia odtwarza z fixture'ów).
// Ten skrypt mierzy to, co czuje użytkownik: klik w pole → POST → OpenRouter →
// ŻYWE LiteAPI → render odpowiedzi w panelu czatu.
//
//   npx tsx bench/concierge/live-ux.ts --base=http://localhost:3000 --label=haiku
//   npx tsx bench/concierge/live-ux.ts --base=https://…vercel.app --share=<url> --label=haiku-preview
//
// READ-ONLY: czat nie rezerwuje i nie płaci. Jedyny koszt to tokeny.

import { chromium, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const STRONA = "/cieple-kierunki";
const MOBILE = { width: 390, height: 844 };

/** Kategoria obciążenia — rozbicie wyników wymagane przez zamówienie. */
type Load = "NO_TOOL" | "ONE_TOOL" | "MULTI_TOOL";

interface Query {
  id: string;
  /** Kolejne wiadomości; >1 = rozmowa (follow-up mierzymy na OSTATNIEJ turze). */
  turns: string[];
  /** Czego się spodziewamy — do sprawdzeń deterministycznych. */
  expectOffer?: boolean;
  /** Bot NIE MA prawa podać kwoty, której nie zwróciło narzędzie. */
  noInventedPrice?: boolean;
  /** Odpowiedź ma pochodzić z sekcji PROCES ZAKUPU, bez szukania oferty. */
  supportOnly?: boolean;
}

const QUERIES: Query[] = [
  { id: "Q01", turns: ["Gdzie polecisz we wrześniu gdzie jest ciepło?"], noInventedPrice: true },
  { id: "Q02", turns: ["Mam 4000 zł dla 2 osób na tydzień"], noInventedPrice: true, expectOffer: true },
  { id: "Q03", turns: ["Lecimy z dwójką dzieci w wakacje"], noInventedPrice: true },
  { id: "Q04", turns: ["Weekend z Warszawy gdzieś tanio"], noInventedPrice: true },
  { id: "Q05", turns: ["Hotel na Rodos blisko plaży"], noInventedPrice: true, expectOffer: true },
  {
    id: "Q06",
    turns: ["Plaża do 3000 zł we wrześniu, 2 osoby", "Coś tańszego"],
    noInventedPrice: true,
  },
  { id: "Q07", turns: ["Kreta czy Rodos?"], noInventedPrice: true },
  { id: "Q08", turns: ["Jak zarezerwować na HelpTravel?"], supportOnly: true, noInventedPrice: true },
  { id: "Q09", turns: ["Znajdź mi coś na 7 nocy"], noInventedPrice: true },
  { id: "Q10", turns: ["Szukam city breaku w październiku dla 2 osób do 2000 zł"], noInventedPrice: true, expectOffer: true },
  { id: "Q11", turns: ["Pokaż konkretną ofertę do Antalyi na wrzesień, 2 osoby"], noInventedPrice: true, expectOffer: true },
  { id: "Q12", turns: ["Ile dokładnie kosztuje Hotel Bristol w Warszawie 12 marca?"], noInventedPrice: true },
  { id: "Q13", turns: ["Czy mogę zapłacić BLIKiem?"], supportOnly: true, noInventedPrice: true },
  { id: "Q14", turns: ["Jaka będzie pogoda 15 lipca w Atenach?"], noInventedPrice: true },
];

interface Measurement {
  id: string;
  turnIndex: number;
  /** Czas do pierwszego WIDOCZNEGO znaku odpowiedzi asystenta. Bez streamingu
   *  równy `totalMs` — i to jest właśnie ustalenie, nie błąd pomiaru. */
  ttftMs: number;
  /** Od wysłania do pełnej odpowiedzi w panelu. */
  totalMs: number;
  /** Czy wskaźnik „Asystent pisze" pojawił się i jak szybko. */
  spinnerMs: number;
  offerShown: boolean;
  isError: boolean;
  text: string;
}

function pct(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.floor((p / 100) * s.length));
  return s[idx];
}

function parseCli(argv: string[]) {
  const get = (n: string) => {
    const hit = argv.find((a) => a.startsWith("--" + n + "="));
    return hit ? hit.slice(n.length + 3) : undefined;
  };
  return {
    base: get("base") ?? "http://localhost:3000",
    share: get("share"),
    label: get("label") ?? "run",
    out: get("out") ?? "bench/concierge/results-ux",
  };
}

async function otworzCzat(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Dobierz wyjazd/i }).click();
  await page.getByRole("dialog").waitFor({ state: "visible", timeout: 15_000 });
}

async function main(): Promise<number> {
  const cli = parseCli(process.argv.slice(2));
  const browser = await chromium.launch();
  const results: Measurement[] = [];

  for (const q of QUERIES) {
    const ctx = await browser.newContext({ viewport: MOBILE });
    // Zgoda na cookies z góry — launcher blokuje otwarcie, dopóki baner czeka.
    await ctx.addInitScript({
      content: `try { localStorage.setItem("helptravel-cookie-consent-v1", JSON.stringify({version:1,decidedAt:1767225600000,decision:{necessary:true,analytics:false,marketing:false}})); } catch(e) {}`,
    });
    const page = await ctx.newPage();
    try {
      if (cli.share) await page.goto(cli.share, { waitUntil: "domcontentloaded" });
      await page.goto(cli.base + STRONA, { waitUntil: "domcontentloaded" });
      await otworzCzat(page);

      const dialog = page.getByRole("dialog");
      const input = dialog.locator("input").first();

      for (let t = 0; t < q.turns.length; t++) {
        await input.fill(q.turns[t]);

        const before = await dialog.innerText();
        const t0 = Date.now();
        await input.press("Enter");

        // Wskaźnik pracy — mierzymy, jak szybko UI w ogóle reaguje.
        let spinnerMs = -1;
        try {
          await dialog.getByText("Asystent pisze").waitFor({ state: "visible", timeout: 5_000 });
          spinnerMs = Date.now() - t0;
        } catch {
          /* brak wskaźnika = zostanie -1 */
        }

        // TTFT = pierwszy WIDOCZNY fragment odpowiedzi. Bez streamingu tekst
        // pojawia się dopiero w całości, więc ta wartość zrówna się z total.
        let ttftMs = -1;
        const deadline = Date.now() + 90_000;
        while (Date.now() < deadline) {
          const now = await dialog.innerText();
          const grew = now.length > before.length + q.turns[t].length + 12;
          const stillTyping = now.includes("Asystent pisze");
          if (grew && !stillTyping) {
            ttftMs = Date.now() - t0;
            break;
          }
          await page.waitForTimeout(120);
        }

        await dialog
          .getByText("Asystent pisze")
          .waitFor({ state: "hidden", timeout: 90_000 })
          .catch(() => undefined);
        const totalMs = Date.now() - t0;

        const text = await dialog.innerText();
        const offerShown =
          (await dialog.locator('a[href*="/hotele/"], a[href*="/loty/"]').count()) > 0;
        const isError =
          (await dialog.getByRole("button", { name: /Spróbuj ponownie/i }).count()) > 0;

        results.push({
          id: q.id,
          turnIndex: t,
          ttftMs: ttftMs < 0 ? totalMs : ttftMs,
          totalMs,
          spinnerMs,
          offerShown,
          isError,
          text: text.slice(-1400),
        });
        console.log(
          `  ${q.id}.${t}  total ${String(totalMs).padStart(6)} ms  ttft ${String(
            ttftMs < 0 ? totalMs : ttftMs,
          ).padStart(6)} ms  spinner ${String(spinnerMs).padStart(4)} ms  ${
            offerShown ? "KARTA" : "     "
          } ${isError ? "BŁĄD" : ""}`,
        );
      }
    } catch (err) {
      console.error("  " + q.id + " WYJĄTEK: " + (err instanceof Error ? err.message : err));
      results.push({
        id: q.id,
        turnIndex: 0,
        ttftMs: -1,
        totalMs: -1,
        spinnerMs: -1,
        offerShown: false,
        isError: true,
        text: "",
      });
    } finally {
      await ctx.close();
    }
  }
  await browser.close();

  const ok = results.filter((r) => r.totalMs > 0);
  const totals = ok.map((r) => r.totalMs);
  const ttfts = ok.map((r) => r.ttftMs);
  const summary = {
    label: cli.label,
    base: cli.base,
    measuredAt: new Date().toISOString(),
    turns: results.length,
    errors: results.filter((r) => r.isError).length,
    offersShown: results.filter((r) => r.offerShown).length,
    totalMs: { p50: pct(totals, 50), p75: pct(totals, 75), p95: pct(totals, 95), max: Math.max(...totals, 0) },
    ttftMs: { p50: pct(ttfts, 50), p75: pct(ttfts, 75), p95: pct(ttfts, 95), max: Math.max(...ttfts, 0) },
    spinnerMs: { p50: pct(ok.map((r) => r.spinnerMs).filter((v) => v >= 0), 50) },
  };

  mkdirSync(join(process.cwd(), cli.out), { recursive: true });
  const file = join(cli.out, cli.label + "__" + Date.now() + ".json");
  writeFileSync(file, JSON.stringify({ summary, results }, null, 1), "utf8");
  console.log("\n" + JSON.stringify(summary, null, 1));
  console.log("zapisano: " + file);
  return 0;
}

main()
  .then((c) => process.exit(c))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
