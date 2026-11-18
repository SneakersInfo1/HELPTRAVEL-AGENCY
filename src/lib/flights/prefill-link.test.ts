import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getAllDestinationProfiles } from "@/lib/mvp/destinations";

import { FLIGHT_SEARCH_HREF, flightSearchPrefillHref, parseFlightSearchPrefill } from "./prefill-link";

const TODAY = "2026-11-17";
const BASE = "https://helptravel.pl";

function hashOf(href: string): string {
  return new URL(href, BASE).hash;
}

describe("link do wyszukiwarki lotów z wypełnionym celem i terminem", () => {
  it("niesie cel i termin we fragmencie, a adres dla wyszukiwarek zostaje /?tab=loty", () => {
    const href = flightSearchPrefillHref({
      destIata: "BCN",
      city: "Barcelona",
      country: "Spain",
      depart: "2027-01-10",
      return: "2027-01-14",
    });
    const url = new URL(href, BASE);
    assert.equal(url.pathname + url.search, FLIGHT_SEARCH_HREF);
    assert.deepEqual(parseFlightSearchPrefill(url.hash, TODAY), {
      destIata: "BCN",
      destination: "Barcelona",
      destinationCountry: "Spain",
      startDate: "2027-01-10",
      endDate: "2027-01-14",
    });
  });

  it("bez terminu przenosi sam cel; kod metropolii (ROM) też jest celem", () => {
    const parsed = parseFlightSearchPrefill(hashOf(flightSearchPrefillHref({ destIata: "rom", city: "Rome", country: "Italy" })), TODAY);
    assert.deepEqual(parsed, {
      destIata: "ROM",
      destination: "Rome",
      destinationCountry: "Italy",
      startDate: null,
      endDate: null,
    });
  });

  it("bez poprawnego kodu IATA albo miasta zwraca zwykłą wyszukiwarkę", () => {
    assert.equal(flightSearchPrefillHref({ destIata: undefined, city: "Barcelona" }), FLIGHT_SEARCH_HREF);
    assert.equal(flightSearchPrefillHref({ destIata: "BC", city: "Barcelona" }), FLIGHT_SEARCH_HREF);
    assert.equal(flightSearchPrefillHref({ destIata: "BCN1", city: "Barcelona" }), FLIGHT_SEARCH_HREF);
    assert.equal(flightSearchPrefillHref({ destIata: "BCN", city: "  " }), FLIGHT_SEARCH_HREF);
  });

  it("powrót przed wylotem nie trafia do linku", () => {
    const href = flightSearchPrefillHref({ destIata: "BCN", city: "Barcelona", depart: "2027-01-10", return: "2027-01-09" });
    const params = new URLSearchParams(hashOf(href).slice(1));
    assert.equal(params.get("depart"), "2027-01-10");
    assert.equal(params.get("return"), null);
  });

  it("każdy z 235 kierunków dostaje link z celem z profilu", () => {
    for (const profile of getAllDestinationProfiles()) {
      const href = flightSearchPrefillHref({ destIata: profile.airportCode, city: profile.city, country: profile.country });
      const parsed = parseFlightSearchPrefill(hashOf(href), TODAY);
      assert.ok(parsed, profile.slug);
      assert.equal(parsed.destIata, profile.airportCode, profile.slug);
      assert.equal(parsed.destination, profile.city, profile.slug);
    }
  });
});

describe("odczyt fragmentu adresu (wejście niezaufane)", () => {
  it("pusty albo obcy fragment nie wypełnia niczego", () => {
    assert.equal(parseFlightSearchPrefill("", TODAY), null);
    assert.equal(parseFlightSearchPrefill("#", TODAY), null);
    assert.equal(parseFlightSearchPrefill("#rooms", TODAY), null);
    assert.equal(parseFlightSearchPrefill("#destination=BCN", TODAY), null);
    assert.equal(parseFlightSearchPrefill("#destLabel=Barcelona", TODAY), null);
  });

  it("odrzuca zły kod IATA i niebezpieczny albo zbyt długi tekst", () => {
    assert.equal(parseFlightSearchPrefill("#destination=B%20N&destLabel=Barcelona", TODAY), null);
    assert.equal(parseFlightSearchPrefill("#destination=BCN&destLabel=%3Cscript%3E", TODAY), null);
    assert.equal(parseFlightSearchPrefill("#destination=BCN&destLabel=Bar%0Acelona", TODAY), null);
    assert.equal(parseFlightSearchPrefill(`#destination=BCN&destLabel=${"a".repeat(81)}`, TODAY), null);
    const badCountry = parseFlightSearchPrefill("#destination=BCN&destLabel=Barcelona&country=%3Cb%3E", TODAY);
    assert.equal(badCountry?.destinationCountry, null);
  });

  it("wylot z przeszłości, zbyt odległy albo nieistniejący — termin wybiera użytkownik", () => {
    const at = (depart: string, ret = "") =>
      parseFlightSearchPrefill(`#destination=BCN&destLabel=Barcelona&depart=${depart}&return=${ret}`, TODAY);
    assert.deepEqual([at("2026-11-16", "2026-11-20")?.startDate, at("2026-11-16", "2026-11-20")?.endDate], [null, null]);
    assert.equal(at("2027-11-19", "2027-11-22")?.startDate, null);
    assert.equal(at("2027-02-30", "2027-03-02")?.startDate, null);
    assert.deepEqual([at("2026-11-17", "2026-11-17")?.startDate, at("2026-11-17", "2026-11-17")?.endDate], ["2026-11-17", "2026-11-17"]);
  });

  it("zły powrót pomija tylko powrót", () => {
    const at = (ret: string) =>
      parseFlightSearchPrefill(`#destination=BCN&destLabel=Barcelona&depart=2027-01-10&return=${ret}`, TODAY);
    assert.deepEqual([at("2027-01-09")?.startDate, at("2027-01-09")?.endDate], ["2027-01-10", null]);
    assert.equal(at("2027-02-15")?.endDate, null);
    assert.equal(at("nie-data")?.endDate, null);
    assert.equal(at("2027-02-09")?.endDate, "2027-02-09");
  });
});
