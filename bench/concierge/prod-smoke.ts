// SMOKE PRODUKCYJNY czatu — wylacznie ODCZYT.
// Zero rezerwacji, zero prebooka, zero platnosci: skrypt tylko rozmawia
// z konsjerzem i czyta to, co widzi uzytkownik.
//
//   npx tsx bench/concierge/prod-smoke.ts --base=https://helptravel.pl [--desktop]
//
// Preview za ochrona Vercela: dopisz --share=<token z _vercel_share>; skrypt
// odwiedza nim strone raz, zeby przegladarka dostala ciasteczko dostepowe.

import { chromium } from "@playwright/test";

const STRONA = "/cieple-kierunki";

interface Krok {
  id: string;
  opis: string;
  turns: string[];
}

const KROKI: Krok[] = [
  { id: "A", opis: "discovery", turns: ["Gdzie polecisz we wrześniu gdzie jest ciepło?"] },
  { id: "B", opis: "budżet + nocy", turns: ["Mam 4000 zł dla 2 osób na 7 nocy"] },
  {
    id: "C",
    opis: "follow-up (pamięć kontekstu)",
    turns: ["Plaża do 3000 zł we wrześniu, 2 osoby", "a coś taniej?"],
  },
  { id: "D", opis: "pytanie o serwis", turns: ["Jak zarezerwować na HelpTravel?"] },
  { id: "E", opis: "wymaga narzędzia", turns: ["Pokaż konkretną ofertę do Antalyi na wrzesień, 2 osoby"] },
  { id: "F", opis: "bez narzędzia", turns: ["Czy mogę zapłacić BLIKiem?"] },
];

function arg(n: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith("--" + n + "="));
  return hit ? hit.slice(n.length + 3) : undefined;
}

async function main(): Promise<number> {
  const base = arg("base") ?? "https://helptravel.pl";
  const desktop = process.argv.includes("--desktop");
  const viewport = desktop ? { width: 1440, height: 900 } : { width: 390, height: 844 };
  const browser = await chromium.launch();
  let bledy = 0;

  console.log(`SMOKE ${base}  viewport ${viewport.width}x${viewport.height}\n`);

  for (const k of KROKI) {
    const ctx = await browser.newContext({ viewport });
    await ctx.addInitScript({
      content: `try{localStorage.setItem("helptravel-cookie-consent-v1",JSON.stringify({version:1,decidedAt:1767225600000,decision:{necessary:true,analytics:false,marketing:false}}))}catch(e){}`,
    });
    const page = await ctx.newPage();
    // Bramka Preview — jedno wejscie z tokenem ustawia ciasteczko w kontekscie.
    const share = arg("share");
    if (share) await page.goto(`${base}/?_vercel_share=${encodeURIComponent(share)}`, { waitUntil: "domcontentloaded" });
    const konsolaBledy: string[] = [];
    page.on("pageerror", (e) => konsolaBledy.push(String(e.message).slice(0, 120)));
    try {
      // `load`, nie `domcontentloaded`: przy DOMContentLoaded launcher bywa
      // jeszcze niezhydratyzowany, klik trafia w martwy przycisk i panel sie
      // nie otwiera. Zlapane na produkcji — 2 z 6 krokow „padly", a byl to
      // wylacznie wyscig w tym skrypcie, nie problem serwisu.
      await page.goto(base + STRONA, { waitUntil: "load" });
      await page.getByRole("button", { name: /Dobierz wyjazd/i }).click();
      const d = page.getByRole("dialog");
      await d.waitFor({ state: "visible", timeout: 20_000 });
      const input = d.locator("input").first();

      let totalMs = 0;
      for (const t of k.turns) {
        await input.fill(t);
        const t0 = Date.now();
        await input.press("Enter");
        await d.getByText("Asystent pisze").waitFor({ state: "visible", timeout: 10_000 }).catch(() => undefined);
        await page
          .locator("span[aria-live='polite']")
          .first()
          .waitFor({ state: "hidden", timeout: 90_000 })
          .catch(() => undefined);
        totalMs = Date.now() - t0;
      }

      const karta = (await d.locator('a[href*="/hotele/"], a[href*="/loty/"]').count()) > 0;
      const blad = (await d.getByRole("button", { name: /Spróbuj ponownie/i }).count()) > 0;
      const tekst = await d.innerText();
      // Linki oferty muszą być WEWNĘTRZNE — model nie ma prawa podać własnego.
      const zleLinki = await d.evaluate((el) =>
        [...el.querySelectorAll("a[href]")]
          .map((a) => a.getAttribute("href") ?? "")
          .filter((h) => /\/(hotele|loty)\//.test(h) && !h.startsWith("/")).length,
      );
      if (blad) bledy++;
      if (zleLinki > 0) bledy++;
      if (konsolaBledy.length > 0) bledy++;

      console.log(
        `${k.id} ${k.opis.padEnd(28)} ${String(totalMs).padStart(6)} ms  ${karta ? "KARTA" : "     "}  ${
          blad ? "BŁĄD" : "ok  "
        }  linki-zewn:${zleLinki}  js-err:${konsolaBledy.length}`,
      );
      const ostatnie = tekst.split("\n").filter((l) => l.trim()).slice(-4).join(" | ");
      console.log(`   ${ostatnie.slice(0, 190)}`);
      if (konsolaBledy.length) console.log("   JS:", konsolaBledy.join(" ; ").slice(0, 160));
    } catch (err) {
      bledy++;
      console.log(`${k.id} WYJĄTEK: ${err instanceof Error ? err.message.slice(0, 120) : err}`);
    } finally {
      await ctx.close();
    }
  }

  await browser.close();
  console.log(`\nkroki z problemem: ${bledy}/${KROKI.length}`);
  return bledy === 0 ? 0 : 1;
}

main()
  .then((c) => process.exit(c))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
