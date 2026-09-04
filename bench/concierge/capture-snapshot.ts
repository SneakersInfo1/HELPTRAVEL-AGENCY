// Zrzuca PRODUKCYJNY snapshot cen (dstprice:v1) do fixture'a benchmarku.
// WYŁĄCZNIE ODCZYT — żadnego zapisu do Upstash (lokalny cron pisze do PROD,
// patrz notatka projektowa; ten skrypt nie może niczego nadpisać).
//
// Uruchomienie: npx tsx --env-file=.env.local bench/concierge/capture-snapshot.ts

import { writeFileSync } from "node:fs";
import { readPriceSnapshot } from "../../src/lib/prices/destination-price-snapshot";

async function main(): Promise<number> {
  const snap = await readPriceSnapshot();
  if (!snap) {
    console.error("BRAK snapshotu (brak env albo pusty klucz) — fixture nie powstał.");
    return 1;
  }
  const keys = Object.keys(snap);
  const withPkg = keys.filter((k) => typeof snap[k].pkgPerPersonPln === "number");
  const withFlight = keys.filter((k) => typeof snap[k].flightFromPln === "number");
  const out = "bench/concierge/fixtures/price-snapshot.json";
  writeFileSync(out, JSON.stringify(snap, null, 1), "utf8");
  console.log(`zapisano ${out}`);
  console.log(`kierunków: ${keys.length}, z pakietem: ${withPkg.length}, z lotem: ${withFlight.length}`);
  const now = Date.now();
  const fresh = keys.filter((k) => now - snap[k].computedAt < 48 * 3600 * 1000);
  console.log(`świeżych (<48h) wpisów hotelowych: ${fresh.length}`);
  console.log("przykład:", JSON.stringify(snap[withPkg[0] ?? keys[0]]));
  return 0;
}

main().then((c) => process.exit(c)).catch((e) => { console.error(e); process.exit(1); });
