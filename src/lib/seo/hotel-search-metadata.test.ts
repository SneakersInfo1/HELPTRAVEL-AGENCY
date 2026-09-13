import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { hotelSearchMetadata } from "./hotel-search-metadata";

// /hotele/szukaj jest w robots.txt jako Disallow, a strona deklarowała
// `index, follow` i canonical z parametrami — trzy sprzeczne sygnały dla tego
// samego adresu (audyt SEO Growth V1, pkt 44). Wyniki wyszukiwania nie są
// stronami do indeksu: zawsze noindex i bez canonicala wskazującego wariant.
const NOINDEX = { index: false, follow: true };

describe("metadane wyszukiwarki hoteli", () => {
  it("wyspa albo region: noindex, bez canonicala", () => {
    const metadata = hotelSearchMetadata({ region: { namePl: "Majorka", countryPl: "Hiszpania" } });
    assert.equal(metadata.title, "Hotele Majorka, Hiszpania — ceny w PLN");
    assert.deepEqual(metadata.robots, NOINDEX);
    assert.equal(metadata.alternates, undefined);
  });

  it("miasto z parametrów: noindex, bez canonicala", () => {
    const metadata = hotelSearchMetadata({ destination: "Barcelona", country: "Spain" });
    assert.equal(metadata.title, "Hotele Barcelona, Spain — ceny w PLN");
    assert.deepEqual(metadata.robots, NOINDEX);
    assert.equal(metadata.alternates, undefined);
  });

  it("pusta wyszukiwarka: noindex", () => {
    const metadata = hotelSearchMetadata({});
    assert.equal(metadata.title, "Wyszukiwarka hoteli");
    assert.deepEqual(metadata.robots, NOINDEX);
    assert.equal(metadata.alternates, undefined);
  });
});
