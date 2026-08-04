// Sonda cen lotów na kierunki WYPOCZYNKOWE — właściciel prosi o „bardziej
// turystyczne kierunki" (Alicante, Grecja, Hiszpania) zamiast miast.
//
// Poprzednia sonda (2026-08-02) dała dla tych tras 989–2828 zł, ale ceny na
// żywej sekcji spadły od tamtej pory do 164–306 zł, więc tamten wniosek trzeba
// sprawdzić od nowa, a nie powtórzyć z pamięci.
//
// Uruchomienie: pnpm probe:flights

import { searchFlightOffers } from "@/lib/flights/search-offers";
import { FlightSearchInputSchema } from "@/lib/flights/types";
import { computeDealDateWindows } from "@/lib/flights/deals-config";

const TRASY: Array<[string, string]> = [
  ["ALC", "Alicante"],
  ["AGP", "Malaga"],
  ["PMI", "Palma"],
  ["BCN", "Barcelona"],
  ["VLC", "Walencja"],
  ["FAO", "Faro"],
  ["LIS", "Lizbona"],
  ["ATH", "Ateny"],
  ["SKG", "Saloniki"],
  ["RHO", "Rodos"],
  ["HER", "Heraklion"],
  ["CFU", "Korfu"],
  ["CTA", "Katania"],
  ["NAP", "Neapol"],
  ["SPU", "Split"],
  ["DBV", "Dubrownik"],
  ["AYT", "Antalya"],
  ["LCA", "Larnaka"],
  ["TFS", "Teneryfa"],
  ["MLA", "Malta"],
];

const okna = computeDealDateWindows().slice(0, 3);

async function jednaTrasa(iata: string, nazwa: string) {
  const ceny: number[] = [];
  for (const okno of okna) {
    try {
      const input = FlightSearchInputSchema.parse({
        legs: [
          { origin: "WAW", destination: iata, date: okno.checkin, direction: "OUTBOUND" },
          { origin: iata, destination: "WAW", date: okno.checkout, direction: "INBOUND" },
        ],
        adults: 1,
      });
      const offers = await searchFlightOffers(input);
      const kwoty = (offers ?? [])
        .map((o) => (o.currency === "PLN" ? o.total : undefined))
        .filter((v): v is number => typeof v === "number" && v > 0);
      if (kwoty.length) ceny.push(Math.min(...kwoty));
    } catch (e) {
      void e; // pojedyncze okno może paść — sondy nie przerywamy
    }
  }
  if (!ceny.length) return { nazwa, iata, min: null as number | null, probek: 0 };
  return { nazwa, iata, min: Math.min(...ceny), probek: ceny.length };
}

async function main() {
  console.log("Okna:", okna.map((o) => `${o.checkin}→${o.checkout}`).join("  "));
  const wyniki: Array<Awaited<ReturnType<typeof jednaTrasa>>> = [];
  for (let i = 0; i < TRASY.length; i += 4) {
    const partia = TRASY.slice(i, i + 4);
    const r = await Promise.all(partia.map(([iata, nazwa]) => jednaTrasa(iata, nazwa)));
    r.forEach((x) => {
      wyniki.push(x);
      console.log(
        `${x.nazwa.padEnd(12)} ${x.iata}  ${x.min === null ? "  brak" : String(x.min).padStart(5) + " zł"}  (próbek: ${x.probek})`,
      );
    });
  }
  const zCena = wyniki.filter((w) => w.min !== null) as Array<{ nazwa: string; min: number }>;
  const pod900 = zCena.filter((w) => w.min <= 900).sort((a, b) => a.min - b.min);
  console.log("\n=== PODSUMOWANIE ===");
  console.log(`Tras zbadanych: ${wyniki.length}, z ceną: ${zCena.length}`);
  console.log(`Poniżej 900 zł: ${pod900.length}`);
  pod900.forEach((w) => console.log(`   ${w.nazwa} — ${w.min} zł`));
  if (zCena.length) console.log(`Minimum globalne: ${Math.min(...zCena.map((w) => w.min))} zł`);
}

main().catch((e) => {
  console.error("SONDA PADŁA:", e);
  process.exit(1);
});
