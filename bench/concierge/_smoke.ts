// Sanity fixture'ów: przepuszcza REALNE egzekutory narzędzi przez deps
// benchmarkowe i sprawdza determinizm. Uruchom z katalogu repo:
//   npx tsx bench/concierge/_smoke.ts

import { createToolExecutors } from "../../src/lib/concierge/tools";
import { buildFixtureToolDeps, fixtureMeta, fixtureStats } from "./fixture-deps";

async function main(): Promise<void> {
  const ex = createToolExecutors(buildFixtureToolDeps());
  console.log("fixtureMeta:", fixtureMeta);

  console.log("\nlist_themes:", JSON.stringify(ex.executeListThemes()).slice(0, 400));

  const search = await ex.executeSearchTrips({
    theme: "plaza",
    budgetPln: 3000,
    budgetKind: "per_person",
    month: 9,
    adults: 2,
    wantsFlight: true,
    wantsHotel: true,
  });
  console.log("\nsearch_trips (plaza, 3000/os, wrzesien):");
  console.log(JSON.stringify(search, null, 1).slice(0, 1200));

  const offerArgs = {
    cityEn: "Rhodes",
    countryEn: "Greece",
    origin: "WAW",
    month: 9,
    adults: 2,
    children: 0,
    wantsFlight: true,
    wantsHotel: true,
  };
  const offer = await ex.executeGetTripOffer(offerArgs);
  console.log("\nget_trip_offer (Rhodes):");
  console.log(
    JSON.stringify(
      {
        city: offer.cityPl,
        checkin: offer.checkin,
        checkout: offer.checkout,
        nights: offer.nights,
        hotel: offer.hotel && {
          name: offer.hotel.name,
          totalPln: offer.hotel.totalPln,
          rating: offer.hotel.rating,
        },
        flight: offer.flight && {
          totalPln: offer.flight.totalPln,
          carrier: offer.flight.carrierName,
          stops: offer.flight.stops,
        },
        totalPerPersonPln: offer.totalPerPersonPln,
        partial: offer.partial,
      },
      null,
      1,
    ),
  );

  const again = await ex.executeGetTripOffer(offerArgs);
  console.log("\nDETERMINIZM (to samo zapytanie 2x):", JSON.stringify(again) === JSON.stringify(offer));
  console.log("fixtureStats:", fixtureStats);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
