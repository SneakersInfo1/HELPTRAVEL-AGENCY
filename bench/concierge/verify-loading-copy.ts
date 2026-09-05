// Weryfikacja progresywnego wskaznika na ZYWO: czy napis realnie przechodzi
// przez kolejne progi w prawdziwym interfejsie i czy bubble nie zmienia
// wysokosci (layout shift).
//
//   npx tsx bench/concierge/verify-loading-copy.ts --base=http://localhost:3000
//   npx tsx bench/concierge/verify-loading-copy.ts --base=https://... --share=<url>

import { chromium } from "@playwright/test";

const STRONA = "/cieple-kierunki";
// Zapytanie z narzedziem — tylko takie trwa dosc dlugo, zeby zobaczyc progi.
const DLUGIE = "Mam 4000 zl dla 2 osob na tydzien we wrzesniu, plaza";

function arg(n: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith("--" + n + "="));
  return hit ? hit.slice(n.length + 3) : undefined;
}

async function main(): Promise<number> {
  const base = arg("base") ?? "http://localhost:3000";
  const share = arg("share");
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript({
    content: `try { localStorage.setItem("helptravel-cookie-consent-v1", JSON.stringify({version:1,decidedAt:1767225600000,decision:{necessary:true,analytics:false,marketing:false}})); } catch(e) {}`,
  });
  const page = await ctx.newPage();
  if (share) await page.goto(share, { waitUntil: "domcontentloaded" });
  await page.goto(base + STRONA, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Dobierz wyjazd/i }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible" });

  const input = dialog.locator("input").first();
  await input.fill(DLUGIE);

  const seen: Array<{ atMs: number; label: string; h: number; w: number }> = [];
  const t0 = Date.now();
  await input.press("Enter");

  // Probkujemy napis wskaznika co 250 ms i notujemy KAZDA zmiane.
  //
  // UWAGA na ksztalt tej petli: pierwsza wersja liczyla `boundingBox()` z
  // lokatora z `.filter({hasText})` przy KAZDEJ probce. Taki lokator czeka na
  // dopasowanie do domyslnego timeoutu, wiec petla probkowala co ~30 s zamiast
  // co 250 ms i przegapila trzeci prog — wygladalo to na blad funkcji, a bylo
  // bledem pomiaru. Teraz: tani odczyt napisu, a geometria liczona z RODZICA
  // tego samego elementu, bez filtrowania po tresci.
  const etykieta = dialog.locator("span[aria-live='polite']").first();
  let last = "";
  while (Date.now() - t0 < 40_000) {
    const label = await etykieta.innerText({ timeout: 1_000 }).catch(() => "");
    if (!label) break; // wskaznik zniknal = odpowiedz przyszla
    if (label !== last) {
      const box = await etykieta
        .locator("xpath=..")
        .boundingBox({ timeout: 1_000 })
        .catch(() => null);
      seen.push({
        atMs: Date.now() - t0,
        label,
        h: box ? Math.round(box.height) : -1,
        w: box ? Math.round(box.width) : -1,
      });
      last = label;
    }
    await page.waitForTimeout(250);
  }
  const totalMs = Date.now() - t0;
  const finalText = await dialog.innerText();

  console.log("przejscia napisu:");
  for (const s of seen) {
    console.log(`  +${String(s.atMs).padStart(6)} ms  h=${String(s.h).padStart(3)}px  „${s.label}"`);
  }
  console.log(`\ncalkowity czas tury: ${totalMs} ms`);
  const heights = [...new Set(seen.map((s) => s.h).filter((h) => h > 0))];
  console.log("wysokosci bubble:", heights, heights.length <= 1 ? "-> BEZ layout shift" : "-> UWAGA: zmiana wysokosci");
  console.log("wskaznik zniknal po odpowiedzi:", !finalText.includes("Asystent pisze") && !finalText.includes("Sprawdzam ceny"));
  console.log("odpowiedz niepusta:", finalText.length > 200);

  await browser.close();
  return seen.length >= 1 ? 0 : 1;
}

main()
  .then((c) => process.exit(c))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
