// Sekcja „Polecane hotele" — kontrakt rotacji i uczciwości danych.
//
// Testowane są WŁASNOŚCI, nie konkretne wartości: rotacja ma się zmieniać co
// okno i wracać do początku po pełnym obrocie, a snapshot ma raczej zniknąć,
// niż pokazać cenę bez pokrycia. Obie rzeczy zawodzą po cichu — sekcja dalej
// się renderuje, tylko z nieprawdą — więc nie ma sposobu, żeby wyłapać je
// „na oko przy wdrożeniu".

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FEATURED_FRESH_MS,
  FEATURED_MIN,
  ROTATION_MS,
  __resetFeaturedHotelsRedisForTests,
  __setFeaturedHotelsRedisForTests,
  credibilityScore,
  isDisplayableHotel,
  pickFreshFeatured,
  pickValuePicks,
  readFeaturedHotels,
  rotateSlice,
  rotationBucket,
  sortFeatured,
  writeFeaturedHotels,
  type FeaturedHotel,
  type FeaturedHotelsSnapshot,
} from "./featured-hotels";

const TERAZ = Date.parse("2026-08-02T10:00:00Z");

function hotel(over: Partial<FeaturedHotel> = {}): FeaturedHotel {
  return {
    id: "lp12345",
    name: "Hotel Testowy",
    cityLabel: "Barcelona",
    countryLabel: "Hiszpania",
    photo: "https://static.cupid.travel/hotels/x.jpg",
    perNightPln: 320,
    totalPln: 640,
    checkin: "2026-08-30",
    checkout: "2026-09-01",
    ...over,
  };
}

// ── Rotacja ─────────────────────────────────────────────────────────────────

test("okno rotacji zmienia się dokładnie co 6 godzin", () => {
  assert.equal(ROTATION_MS, 6 * 3600 * 1000);
  // Kotwica NA GRANICY okna (06:00 UTC), nie w jego środku: liczenie „od teraz
  // + 6 h" ze środka okna przeskakuje granicę wcześniej i test mierzyłby coś
  // innego, niż nazywa.
  const granica = Date.parse("2026-08-02T06:00:00Z");
  const b = rotationBucket(granica);
  assert.equal(rotationBucket(granica + ROTATION_MS - 1), b, "przed upływem 6 h to wciąż to samo okno");
  assert.equal(rotationBucket(granica + ROTATION_MS), b + 1, "po 6 h okno musi się przesunąć");
  // Cztery okna na dobę — tyle razy dziennie zmienia się zestaw.
  assert.equal(rotationBucket(granica + 24 * 3600 * 1000) - b, 4);
});

test("kolejne okna dają rozłączne zestawy, a pula się zawija", () => {
  const pula = ["a", "b", "c", "d", "e"];
  const w0 = rotateSlice(pula, 2, 0);
  const w1 = rotateSlice(pula, 2, 1);
  const w2 = rotateSlice(pula, 2, 2);
  assert.deepEqual(w0, ["a", "b"]);
  assert.deepEqual(w1, ["c", "d"]);
  // Piąty element + zawinięcie na początek — nigdy zestaw krótszy niż `size`.
  assert.deepEqual(w2, ["e", "a"]);
  assert.equal(w2.length, 2);
});

test("rotacja jest deterministyczna dla tego samego okna", () => {
  const pula = ["a", "b", "c", "d"];
  assert.deepEqual(rotateSlice(pula, 3, 7), rotateSlice(pula, 3, 7));
});

test("rotacja nie wywraca się na pustej puli ani na wycinku większym niż pula", () => {
  assert.deepEqual(rotateSlice([], 5, 3), []);
  // Wycinek szerszy niż pula bierze całą pulę. Rotacja przestaje wtedy cokolwiek
  // zmieniać — i tak ma być: nie da się „obrócić" zestawu, który już zawiera
  // wszystko. Realna pula (FEATURED_DESTINATION_POOL) jest kilkukrotnie większa
  // od wycinka, więc ten przypadek to zabezpieczenie, nie tryb pracy.
  assert.deepEqual(rotateSlice(["a", "b"], 10, 1), ["a", "b"]);
  assert.deepEqual(rotateSlice(["a", "b"], 10, 2), ["a", "b"]);
});

// ── Uczciwość karty ─────────────────────────────────────────────────────────

test("hotel bez zdjęcia albo bez ceny nie ma prawa wejść do pasa", () => {
  assert.equal(isDisplayableHotel(hotel()), true);
  assert.equal(isDisplayableHotel(hotel({ photo: "" })), false);
  assert.equal(isDisplayableHotel(hotel({ photo: "//bez-schematu.jpg" })), false);
  assert.equal(isDisplayableHotel(hotel({ perNightPln: 0 })), false);
  assert.equal(isDisplayableHotel(hotel({ totalPln: Number.NaN })), false);
  assert.equal(isDisplayableHotel(hotel({ name: "   " })), false);
  assert.equal(isDisplayableHotel(null), false);
});

test("kolejność: najpierw najlepiej oceniane, a brak oceny to nie ocena zerowa", () => {
  const OP = 3000; // ta sama, duża liczba opinii — porównujemy same oceny
  const posortowane = sortFeatured([
    hotel({ id: "bez-oceny", rating: undefined, reviewCount: OP, perNightPln: 100 }),
    hotel({ id: "slabszy", rating: 8.1, reviewCount: OP, perNightPln: 900 }),
    hotel({ id: "najlepszy", rating: 9.4, reviewCount: OP, perNightPln: 800 }),
  ]);
  assert.deepEqual(
    posortowane.map((h) => h.id),
    ["najlepszy", "slabszy", "bez-oceny"],
  );
});

test("przy równej ocenie wygrywa tańszy", () => {
  const posortowane = sortFeatured([
    hotel({ id: "drozszy", rating: 9, reviewCount: 500, perNightPln: 700 }),
    hotel({ id: "tanszy", rating: 9, reviewCount: 500, perNightPln: 400 }),
  ]);
  assert.equal(posortowane[0].id, "tanszy");
});

// To jest poprawka po REALNEJ wpadce: pierwszy przebieg crona sortował po samym
// `rating` i wszystkie dwanaście kart wyszło z oceną „10,0". Każda liczba była
// prawdziwa, a pas i tak wyglądał na zmyślony.
test("dziesiątka z garstki opinii przegrywa z bardzo dobrą oceną z tysięcy", () => {
  const posortowane = sortFeatured([
    hotel({ id: "pensjonat", rating: 10, reviewCount: 3, perNightPln: 200 }),
    hotel({ id: "znany", rating: 9.5, reviewCount: 5000, perNightPln: 900 }),
  ]);
  assert.deepEqual(posortowane.map((h) => h.id), ["znany", "pensjonat"]);
});

// ── Dobór „najlepiej oceniane w rozsądnej cenie" (decyzja właściciela) ──────

test("z drogiej połowy nie bierzemy nic, nawet jeśli ma najlepszą ocenę", () => {
  // Realny kształt problemu: najlepiej oceniane obiekty kierunku to zwykle
  // najdroższe, więc sam ranking jakości dawał pas po 2000 zł za dobę.
  const pula = [
    hotel({ id: "lux-1", perNightPln: 2100, rating: 9.9, reviewCount: 4000 }),
    hotel({ id: "lux-2", perNightPln: 1800, rating: 9.8, reviewCount: 4000 }),
    hotel({ id: "lux-3", perNightPln: 1500, rating: 9.7, reviewCount: 4000 }),
    hotel({ id: "tani-dobry", perNightPln: 400, rating: 9.4, reviewCount: 4000 }),
    hotel({ id: "tani-sredni", perNightPln: 350, rating: 8.2, reviewCount: 4000 }),
    hotel({ id: "tani-slaby", perNightPln: 300, rating: 7.1, reviewCount: 4000 }),
  ];
  const wybor = pickValuePicks(pula, 2).map((h) => h.id);
  // Z tańszej połowy (300/350/400) najlepiej oceniane to „tani-dobry".
  assert.deepEqual(wybor, ["tani-dobry", "tani-sredni"]);
  assert.ok(!wybor.some((id) => id.startsWith("lux")), "luksus nie ma prawa wejść");
});

test("w tańszej części dalej rządzi JAKOŚĆ, nie cena", () => {
  // Sekcja nazywa się „Polecane": po odcięciu drogich nie wolno po prostu
  // wziąć najtańszego, bo wtedy byłby to ranking cen pod inną nazwą.
  const pula = [
    hotel({ id: "najtanszy-slaby", perNightPln: 200, rating: 6.5, reviewCount: 900 }),
    hotel({ id: "tanszy-dobry", perNightPln: 260, rating: 9.3, reviewCount: 900 }),
    hotel({ id: "drogi", perNightPln: 900, rating: 9.9, reviewCount: 900 }),
    hotel({ id: "drogi-2", perNightPln: 950, rating: 9.9, reviewCount: 900 }),
  ];
  assert.equal(pickValuePicks(pula, 1)[0].id, "tanszy-dobry");
});

test("uboga pula kierunku nie zostaje bez wyboru", () => {
  // Zmierzone: Palma potrafi dać 2–5 wycenionych obiektów. Ścisła połowa
  // zostawiłaby wtedy jeden i „wybór" byłby pozorny.
  const male = [
    hotel({ id: "a", perNightPln: 500, rating: 9.5, reviewCount: 500 }),
    hotel({ id: "b", perNightPln: 700, rating: 9.0, reviewCount: 500 }),
  ];
  assert.equal(pickValuePicks(male, 2).length, 2);
  assert.deepEqual(pickValuePicks([], 2), []);
  assert.deepEqual(pickValuePicks(male, 0), []);
});

test("dobór nie mutuje wejścia — cron używa tej samej tablicy dalej", () => {
  const pula = [
    hotel({ id: "x", perNightPln: 900, rating: 9.9, reviewCount: 900 }),
    hotel({ id: "y", perNightPln: 100, rating: 8.0, reviewCount: 900 }),
  ];
  const przed = pula.map((h) => h.id);
  pickValuePicks(pula, 1);
  assert.deepEqual(pula.map((h) => h.id), przed);
});

test("wiarygodność: ściąganie do średniej działa w obie strony", () => {
  // Mało opinii → ocena dociągana do odniesienia.
  assert.ok(credibilityScore(10, 3) < 8.5);
  // Dużo opinii → ocena praktycznie własna.
  assert.ok(Math.abs(credibilityScore(9.5, 5000) - 9.5) < 0.05);
  // Brak oceny nigdy nie wygrywa z jakąkolwiek oceną.
  assert.ok(credibilityScore(undefined, 9999) < credibilityScore(6, 1));
});

// ── Świeżość ────────────────────────────────────────────────────────────────

function snapshot(over: Partial<FeaturedHotelsSnapshot> = {}): FeaturedHotelsSnapshot {
  return {
    computedAt: TERAZ,
    hotels: Array.from({ length: FEATURED_MIN }, (_, i) => hotel({ id: `lp${i}` })),
    ...over,
  };
}

test("świeży snapshot z kompletem kart przechodzi", () => {
  assert.equal(pickFreshFeatured(snapshot(), TERAZ).length, FEATURED_MIN);
});

test("przeterminowany snapshot znika w całości — nigdy nie pokazujemy starej ceny", () => {
  assert.deepEqual(pickFreshFeatured(snapshot(), TERAZ + FEATURED_FRESH_MS + 1), []);
});

test("brak snapshotu i brak computedAt to po prostu brak sekcji", () => {
  assert.deepEqual(pickFreshFeatured(null, TERAZ), []);
  assert.deepEqual(pickFreshFeatured({ hotels: [hotel()] } as FeaturedHotelsSnapshot, TERAZ), []);
});

test("poniżej progu kart sekcja się nie renderuje", () => {
  const zaMalo = snapshot({ hotels: [hotel({ id: "a" }), hotel({ id: "b" })] });
  assert.deepEqual(pickFreshFeatured(zaMalo, TERAZ), []);
});

test("wpis z terminem, który już minął, wypada — karta linkuje właśnie na te daty", () => {
  const poTerminie = snapshot({
    hotels: [
      hotel({ id: "przeszly", checkin: "2026-07-01", checkout: "2026-07-03" }),
      hotel({ id: "ok1" }),
      hotel({ id: "ok2" }),
      hotel({ id: "ok3" }),
      hotel({ id: "ok4" }),
    ],
  });
  const widoczne = pickFreshFeatured(poTerminie, TERAZ).map((h) => h.id);
  assert.ok(!widoczne.includes("przeszly"));
  assert.equal(widoczne.length, 4);
});

// ── I/O (fake Redis przez seam) ─────────────────────────────────────────────

test("zapis nadpisuje zestaw i odsiewa wpisy niepełne", async (t) => {
  const store = new Map<string, unknown>();
  __setFeaturedHotelsRedisForTests({
    async get(key) {
      return (store.get(key) ?? null) as never;
    },
    async set(key, value) {
      store.set(key, value);
      return "OK";
    },
  });
  t.after(() => __resetFeaturedHotelsRedisForTests());

  await writeFeaturedHotels([hotel({ id: "dobry" }), hotel({ id: "bez-foto", photo: "" })], TERAZ);
  const odczyt = await readFeaturedHotels();
  assert.equal(odczyt?.computedAt, TERAZ);
  assert.deepEqual(odczyt?.hotels.map((h) => h.id), ["dobry"]);
});

test("brak Redisa nie wywraca ani zapisu, ani odczytu", async (t) => {
  __setFeaturedHotelsRedisForTests(null);
  t.after(() => __resetFeaturedHotelsRedisForTests());
  await writeFeaturedHotels([hotel()], TERAZ);
  assert.equal(await readFeaturedHotels(), null);
});

test("błąd Redisa degraduje do braku sekcji, nie do wyjątku", async (t) => {
  __setFeaturedHotelsRedisForTests({
    async get() {
      throw new Error("upstash down");
    },
    async set() {
      throw new Error("upstash down");
    },
  });
  t.after(() => __resetFeaturedHotelsRedisForTests());
  await assert.doesNotReject(() => writeFeaturedHotels([hotel()], TERAZ));
  assert.equal(await readFeaturedHotels(), null);
});
