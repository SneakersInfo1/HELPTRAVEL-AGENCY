import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { liveSearchAllowed, photoDescribesDestination } from "./photo-guards";

const BARCELONA = { city: "Barcelona", country: "Spain" };
const NICE = { city: "Nice", country: "France" };
const PORTO = { city: "Porto", country: "Portugal" };

describe("zdjęcie z wyszukiwania musi opisywać TO miasto w TYM kraju", () => {
  it("przyjmuje opis z miastem i krajem, po angielsku albo po polsku", () => {
    assert.equal(photoDescribesDestination("Aerial view of Barcelona, Spain with the Sagrada Familia", BARCELONA), true);
    assert.equal(photoDescribesDestination("Widok na Ateny, Grecja", { city: "Athens", country: "Greece" }), true);
    assert.equal(photoDescribesDestination("Old town of Málaga, Spain at sunset", { city: "Malaga", country: "Spain" }), true);
    assert.equal(photoDescribesDestination("Times Square at night, New York City, USA", { city: "New York", country: "United States of America" }), true);
  });

  it("odrzuca zdjęcie innego miasta, nawet ikonicznego", () => {
    // Wieża Eiffla jako Barcelona — ten błąd trafił na produkcję 19.11.2026.
    assert.equal(photoDescribesDestination("Eiffel Tower in Paris, France at dusk", BARCELONA), false);
    assert.equal(photoDescribesDestination("Brandenburg Gate, Berlin, Germany", { city: "Budapest", country: "Hungary" }), false);
    // Na „Rhodes Greece” wyszukiwarka zwróciła Korfu — to zdjęcie stało w katalogu jako Rodos.
    const corfu = "Aerial view of the historic Old Town of Corfu, Greece with its charming architecture under a clear blue sky.";
    assert.equal(photoDescribesDestination(corfu, { city: "Rhodes", country: "Greece" }), false);
    assert.equal(photoDescribesDestination(corfu, { city: "Corfu", country: "Greece" }), true);
  });

  it("bez kraju w opisie zdjęcie nie przechodzi (miasta o tej samej nazwie)", () => {
    assert.equal(photoDescribesDestination("Barcelona skyline at night", BARCELONA), false);
    assert.equal(photoDescribesDestination("Valencia, Venezuela at night", { city: "Valencia", country: "Spain" }), false);
  });

  it("miasto-państwo: nazwa miasta wystarcza", () => {
    assert.equal(photoDescribesDestination("Singapore skyline at night", { city: "Singapore", country: "Singapore" }), true);
    assert.equal(photoDescribesDestination("Victoria Harbour, Hong Kong", { city: "Hong Kong", country: "Hong Kong" }), true);
    assert.equal(photoDescribesDestination("Marina Bay at night", { city: "Singapore", country: "Singapore" }), false);
  });

  it("nazwy będące zwykłymi słowami przechodzą tylko jako „Miasto, Kraj”", () => {
    assert.equal(photoDescribesDestination("Promenade des Anglais in Nice, France", NICE), true);
    assert.equal(photoDescribesDestination("Nice, France at sunset", NICE), true);
    assert.equal(photoDescribesDestination("A nice beach in Barcelona, Spain", NICE), false);
    assert.equal(photoDescribesDestination("Nice view of Paris, France", NICE), false);
    assert.equal(photoDescribesDestination("(Nice view of Paris, France)", NICE), false);
    assert.equal(photoDescribesDestination("“Nice” view of Paris, France", NICE), false);
    assert.equal(photoDescribesDestination("A male traveler in Paris, France", { city: "Male", country: "Maldives" }), false);
    assert.equal(photoDescribesDestination("Faro de Trafalgar lighthouse in Spain", { city: "Faro", country: "Portugal" }), false);
    assert.equal(photoDescribesDestination("Arco da Vila in Faro, Algarve", { city: "Faro", country: "Portugal" }), true);
    assert.equal(photoDescribesDestination("Beach on Porto Santo island, Madeira, Portugal", PORTO), false);
    assert.equal(photoDescribesDestination("Ribeira district of Porto, Portugal", PORTO), true);
    assert.equal(photoDescribesDestination("Santiago, Chile skyline with the Andes", { city: "Santiago", country: "Chile" }), true);
    assert.equal(photoDescribesDestination("Cathedral of Santiago de Compostela, Spain", { city: "Santiago", country: "Chile" }), false);
  });

  it("odrzuca pusty opis i dopasowania w środku innego słowa", () => {
    assert.equal(photoDescribesDestination("", { city: "Rome", country: "Italy" }), false);
    assert.equal(photoDescribesDestination("Romeo and Juliet balcony in Verona, Italy", { city: "Rome", country: "Italy" }), false);
  });

  it("inne nazwy miasta tylko z ręcznej listy, bez reguły „ostatni wyraz”", () => {
    const tenerife = { city: "Santa Cruz de Tenerife", country: "Spain" };
    assert.equal(photoDescribesDestination("Las Teresitas beach, Tenerife, Canary Islands", tenerife), true);
    // Alias kraju równy nazwie miasta nie zastępuje kraju.
    assert.equal(photoDescribesDestination("Las Teresitas beach, Tenerife", tenerife), false);
    // Z „Playa del Carmen” nie robi się „Carmen”, a z „Sharm el Sheikh” — „Sheikh”.
    assert.equal(photoDescribesDestination("Portrait of Carmen in Mexico City, Mexico", { city: "Playa del Carmen", country: "Mexico" }), false);
    assert.equal(photoDescribesDestination("A Sheikh outside a mosque in Cairo, Egypt", { city: "Sharm el Sheikh", country: "Egypt" }), false);
  });
});

describe("wyszukiwanie Pexels na żywo nie zużywa limitu poza produkcją", () => {
  it("bez klucza nigdy", () => {
    assert.equal(liveSearchAllowed({ VERCEL_ENV: "production" }), false);
  });

  it("Preview i build lokalny bez jawnej zgody — nie", () => {
    assert.equal(liveSearchAllowed({ PEXELS_API_KEY: "k", VERCEL_ENV: "preview" }), false);
    assert.equal(liveSearchAllowed({ PEXELS_API_KEY: "k" }), false);
  });

  it("produkcja albo jawne PEXELS_LIVE_SEARCH=1 — tak", () => {
    assert.equal(liveSearchAllowed({ PEXELS_API_KEY: "k", VERCEL_ENV: "production" }), true);
    assert.equal(liveSearchAllowed({ PEXELS_API_KEY: "k", PEXELS_LIVE_SEARCH: "1" }), true);
  });
});
