import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { KLASYFIKACJA_PRYWATNOSCI } from "./track";

// Kontrakt zdarzeń analitycznych — testy STRUKTURALNE na źródłach.
//
// Powód, dla którego to są testy czytające pliki, a nie testy jednostkowe
// funkcji: cała kategoria błędów, którą naprawia PR #2A, to NIE „funkcja
// liczy źle", tylko „zdarzenie jest zdefiniowane i nikt go nie wysyła" albo
// „ktoś skleił ścieżkę po swojemu". Tego nie złapie żaden test wywołujący
// `track()`; trzeba spytać o kod. Repo stosuje ten wzorzec już wcześniej
// (tailwind-komentarze.test.ts, internal-notes.test.ts, html-limited-bots).

// `process.cwd()` zamiast `import.meta.dirname`: tsx kompiluje testy do CJS,
// gdzie `import.meta.dirname` jest `undefined`. Repo uruchamia testy z korzenia
// i ta sama konwencja jest już w internal-notes.test.ts.
const KORZEN = process.cwd();
const SRC = path.join(KORZEN, "src");

function czytaj(wzgledna: string): string {
  return fs.readFileSync(path.join(KORZEN, wzgledna), "utf8");
}

function wszystkieZrodla(): string[] {
  const wynik: string[] = [];
  (function chodz(katalog: string) {
    for (const wpis of fs.readdirSync(katalog, { withFileTypes: true })) {
      const p = path.join(katalog, wpis.name);
      if (wpis.isDirectory()) chodz(p);
      else if (/\.tsx?$/.test(wpis.name) && !/\.test\.tsx?$/.test(wpis.name)) wynik.push(p);
    }
  })(SRC);
  return wynik;
}

const TRACK_TS = czytaj("src/lib/analytics/track.ts");

/** Ciało `interface TrackEventMap` — od nagłówka do klamry zamykającej. */
function cialoKatalogu(): string {
  const start = TRACK_TS.indexOf("export interface TrackEventMap");
  assert.notEqual(start, -1, "nie znalazłem interfejsu TrackEventMap");
  const koniec = TRACK_TS.indexOf("\n}", start);
  assert.notEqual(koniec, -1, "nie znalazłem końca interfejsu TrackEventMap");
  return TRACK_TS.slice(start, koniec);
}

/** Nazwy zdarzeń = klucze na PIERWSZYM poziomie zagnieżdżenia (dwie spacje). */
function nazwyZdarzen(): string[] {
  const cialo = cialoKatalogu();
  const nazwy = [...cialo.matchAll(/^ {2}([a-z][a-z0-9_]*):/gm)].map((m) => m[1]);
  assert.equal(nazwy.length > 20, true, `podejrzanie mało zdarzeń: ${nazwy.length}`);
  return nazwy;
}

/**
 * Nazwy zdarzeń faktycznie wysyłanych z kodu.
 *
 * Zbiera trzy kształty, bo wszystkie trzy występują w repo:
 *   • `track("nazwa", …)`
 *   • `<TrackView event="nazwa" …>` (strony serwerowe)
 *   • nazwa wybierana wyrażeniem, np. warunkiem — karuzela strony głównej
 *     woła `track(warunek ? "a" : "b")`, więc sama nazwa nie stoi przy `track(`.
 */
function zdarzeniaWysylane(): Map<string, string[]> {
  const mapa = new Map<string, string[]>();
  const dodaj = (nazwa: string, plik: string) => {
    const lista = mapa.get(nazwa) ?? [];
    lista.push(path.relative(KORZEN, plik).replaceAll("\\", "/"));
    mapa.set(nazwa, lista);
  };

  const katalog = new Set(nazwyZdarzen());
  for (const plik of wszystkieZrodla()) {
    if (plik.endsWith(path.join("lib", "analytics", "track.ts"))) continue;
    const tresc = fs.readFileSync(plik, "utf8");
    for (const m of tresc.matchAll(/track\(\s*"([a-z0-9_]+)"/g)) dodaj(m[1], plik);
    for (const m of tresc.matchAll(/event=\{?"([a-z0-9_]+)"/g)) dodaj(m[1], plik);
    // Nazwa podana wyrażeniem: bierzemy każdy literał, który JEST zdarzeniem
    // z katalogu, o ile plik w ogóle woła `track(`.
    if (tresc.includes("track(")) {
      for (const m of tresc.matchAll(/"([a-z][a-z0-9_]{5,})"/g)) {
        if (katalog.has(m[1])) dodaj(m[1], plik);
      }
    }
  }
  return mapa;
}

// ── §10: kontrakt jest kompletny ────────────────────────────────────────
describe("kontrakt zdarzeń — katalog i klasyfikacja nie rozjeżdżają się", () => {
  it("każde zdarzenie z katalogu ma klasyfikację prywatności", () => {
    const bezKlasyfikacji = nazwyZdarzen().filter((n) => !(n in KLASYFIKACJA_PRYWATNOSCI));
    assert.deepEqual(
      bezKlasyfikacji,
      [],
      `zdarzenia bez klasyfikacji prywatności: ${bezKlasyfikacji.join(", ")}`,
    );
  });

  it("klasyfikacja nie opisuje zdarzeń, których już nie ma", () => {
    const katalog = new Set(nazwyZdarzen());
    const osierocone = Object.keys(KLASYFIKACJA_PRYWATNOSCI).filter((n) => !katalog.has(n));
    assert.deepEqual(osierocone, [], `klasyfikacja bez zdarzenia: ${osierocone.join(", ")}`);
  });

  it("nie istnieje klasa „osobowe” — dane osobowe nie mają prawa trafić do GA4", () => {
    const klasy = new Set(Object.values(KLASYFIKACJA_PRYWATNOSCI));
    assert.deepEqual([...klasy].sort(), ["anonimowe", "techniczne"]);
  });
});

// ── §11G: zero PII ──────────────────────────────────────────────────────
describe("zero danych osobowych w parametrach zdarzeń (test G)", () => {
  it("żaden parametr katalogu nie nazywa się jak nośnik danych osobowych", () => {
    // Dopasowanie po PEŁNEJ nazwie, nie po fragmencie: w katalogu są legalne
    // `item_name`, `fare_name` i `item_list_name`, a reguła „zawiera name"
    // wywaliłaby je wszystkie i szybko zostałaby wyłączona jako uciążliwa.
    const ZAKAZANE = new Set([
      "email",
      "e_mail",
      "mail",
      "phone",
      "tel",
      "first_name",
      "last_name",
      "full_name",
      "surname",
      "address",
      "street",
      "postal_code",
      "ip",
      "ip_address",
      "user_email",
      "password",
      "token",
      "secret",
      "client_secret",
      "payment_intent",
      "payment_intent_client_secret",
      "card",
      "card_number",
      "pesel",
      "birth_date",
      "passport",
    ]);
    const cialo = cialoKatalogu();
    const parametry = [...cialo.matchAll(/^ {4,}([a-z][a-z0-9_]*)\??:/gm)].map((m) => m[1]);
    const zle = [...new Set(parametry.filter((p) => ZAKAZANE.has(p)))];
    assert.deepEqual(zle, [], `parametry o nazwach danych osobowych: ${zle.join(", ")}`);
  });

  it("treść wiadomości do konsjerża NIE jest parametrem — mierzymy tylko długość", () => {
    const cialo = cialoKatalogu();
    const sekcja = cialo.slice(cialo.indexOf("concierge_message:"));
    assert.equal(sekcja.includes("message_chars"), true);
    assert.equal(/\n\s+(message|text|content|tresc|prompt)\??:/.test(sekcja.slice(0, 400)), false);
  });
});

// ── §2 + §6: żadnych zdarzeń-widm i żadnych duplikatów ──────────────────
describe("każde zdarzenie katalogu jest faktycznie wysyłane (§2)", () => {
  it("nie ma zdarzeń ZDEFINIOWANYCH I NIGDY NIE WYSŁANYCH", () => {
    // To jest dokładnie ta wada, którą PR #2A naprawia: `hotel_card_click`,
    // `landing_cta_click`, `hotel_results_loaded`, `affiliate_click`
    // i `destination_save` istniały w typach, ale żaden kod ich nie wysyłał,
    // więc raport GA4 pokazywał pustkę tam, gdzie „przecież mamy event".
    const wysylane = zdarzeniaWysylane();
    const widma = nazwyZdarzen().filter((n) => !wysylane.has(n));
    assert.deepEqual(
      widma,
      [],
      `zdarzenia bez emitera (albo podłącz, albo usuń z katalogu): ${widma.join(", ")}`,
    );
  });

  it("nie wysyłamy zdarzeń spoza katalogu", () => {
    const katalog = new Set(nazwyZdarzen());
    const spozaKatalogu = [...zdarzeniaWysylane().keys()].filter((n) => !katalog.has(n));
    assert.deepEqual(spozaKatalogu, [], `poza katalogiem: ${spozaKatalogu.join(", ")}`);
  });
});

// ── §3: ścieżka strony powstaje w JEDNYM miejscu ────────────────────────
describe("page_path ma jedno źródło (test A, warstwa strukturalna)", () => {
  it("żaden komponent nie skleja page_path z window.location na własną rękę", () => {
    const winne: string[] = [];
    for (const plik of wszystkieZrodla()) {
      const wzgledny = path.relative(KORZEN, plik).replaceAll("\\", "/");
      if (wzgledny === "src/lib/analytics/page-path.ts") continue;
      const tresc = fs.readFileSync(plik, "utf8");
      if (/page_path:\s*window\.location/.test(tresc)) winne.push(wzgledny);
      // Sklejanie „ścieżka + ? + query" w kontekście analityki.
      if (/page_path:\s*`\$\{[^}]+\}\?/.test(tresc)) winne.push(wzgledny);
    }
    assert.deepEqual(winne, [], `ręcznie budowany page_path: ${winne.join(", ")}`);
  });

  it("emiter page_view przepuszcza ścieżkę i adres przez analyticsPagePath", () => {
    const ga = czytaj("src/components/site/google-analytics.tsx");
    assert.equal(ga.includes("analyticsPagePath("), true, "brak normalizacji ścieżki");
    // Surowy href nie może iść do GA4 — niósł sekret Stripe'a i podwójne query.
    assert.equal(
      ga.includes("page_location: window.location.href"),
      false,
      "page_location znów idzie surowym window.location.href",
    );
  });
});

// ── §11 B/C/D: CTA na stronach treściowych ──────────────────────────────
describe("CTA stron treściowych wysyła seo_cta_click (testy B, C, D)", () => {
  const PRZYPADKI: Array<[string, string, string]> = [
    ["B — strona miesiąca", "src/app/kierunki/[slug]/[miesiac]/page.tsx", "month_page"],
    ["C — przewodnik kierunku", "src/app/kierunki/[slug]/page.tsx", "guide"],
    ["D — porównanie", "src/app/porownanie/[para]/page.tsx", "comparison"],
    ["landing miasta", "src/app/hotele/w/[miasto]/page.tsx", "landing_city"],
  ];

  for (const [etykieta, plik, typTresci] of PRZYPADKI) {
    it(`${etykieta}: linkuje do produktu przez SeoCtaLink z typTresci="${typTresci}"`, () => {
      const tresc = czytaj(plik);
      assert.equal(tresc.includes("<SeoCtaLink"), true, `${plik}: brak SeoCtaLink`);
      assert.equal(
        tresc.includes(`typTresci="${typTresci}"`),
        true,
        `${plik}: brak typTresci="${typTresci}"`,
      );
    });

    it(`${etykieta}: każdy SeoCtaLink ma domknięcie i komplet wymaganych atrybutów`, () => {
      const tresc = czytaj(plik);
      const otwarcia = (tresc.match(/<SeoCtaLink[\s>]/g) ?? []).length;
      const zamkniecia = (tresc.match(/<\/SeoCtaLink>/g) ?? []).length;
      assert.equal(otwarcia, zamkniecia, `${plik}: ${otwarcia} otwarć vs ${zamkniecia} zamknięć`);
      assert.equal(
        (tresc.match(/ctaType="/g) ?? []).length,
        otwarcia,
        `${plik}: nie każdy SeoCtaLink ma ctaType`,
      );
    });
  }

  it("strona miesiąca podaje miesiąc — bez niego nie da się porównać sezonów", () => {
    const tresc = czytaj("src/app/kierunki/[slug]/[miesiac]/page.tsx");
    assert.equal(tresc.includes("month={miesiac}"), true);
  });
});

// ── §11H: jeden klik = jedno zdarzenie ──────────────────────────────────
describe("jeden klik daje jedno zdarzenie (test H)", () => {
  it("seo_cta_click ma DOKŁADNIE JEDEN emiter — komponent SeoCtaLink", () => {
    const emitery = zdarzeniaWysylane().get("seo_cta_click") ?? [];
    assert.deepEqual(
      [...new Set(emitery)],
      ["src/components/analytics/seo-cta-link.tsx"],
      "seo_cta_click wysyłany z więcej niż jednego miejsca — grozi podwójnym liczeniem",
    );
  });

  it("SeoCtaLink ma jeden handler kliknięcia, wpięty w sam link", () => {
    const tresc = czytaj("src/components/analytics/seo-cta-link.tsx");
    assert.equal((tresc.match(/track\("seo_cta_click"/g) ?? []).length, 1);
    assert.equal((tresc.match(/onClick=\{onClick\}/g) ?? []).length, 1);
  });

  it("KAŻDE miejsce renderujące kartę przekazuje wymiary zdarzenia", () => {
    // Ten test istnieje, bo dokładnie tu popełniono błąd przy pisaniu PR #2A:
    // `ResultCard` renderuje się w TRZECH miejscach (lista stronicowana, lista
    // w widoku dzielonym z mapą, podgląd zaznaczonego znacznika), a podłączone
    // zostały tylko dwa. Zdarzenie leciało — bez `position` i `destination`,
    // czyli bez obu wymiarów, dla których je dodano. Sam typ tego nie złapie:
    // oba propsy są opcjonalne z premedytacją (w podglądzie mapy pozycja nie
    // istnieje), więc kompilator milczy.
    const tresc = czytaj("src/app/hotele/szukaj/_components/results-list.tsx");
    const bloki = tresc.split("<ResultCard").slice(1);
    assert.equal(bloki.length >= 3, true, `oczekiwano ≥3 miejsc renderowania, jest ${bloki.length}`);
    bloki.forEach((blok, i) => {
      const atrybuty = blok.slice(0, blok.indexOf("/>"));
      assert.equal(
        atrybuty.includes("destination={"),
        true,
        `ResultCard #${i + 1}: brak propsa destination`,
      );
      // Pozycji nie ma tylko podgląd na mapie — on jest jawnie `compact`.
      if (!atrybuty.includes("compact")) {
        assert.equal(
          atrybuty.includes("position={"),
          true,
          `ResultCard #${i + 1}: brak propsa position (a nie jest compact)`,
        );
      }
    });
  });

  it("karta wyniku wysyła hotel_card_click raz, z linku obejmującego całą kartę (test E)", () => {
    const tresc = czytaj("src/app/hotele/szukaj/_components/result-card.tsx");
    assert.equal((tresc.match(/track\("hotel_card_click"/g) ?? []).length, 1);
    assert.equal(tresc.includes("onClick={onCardClick}"), true);
    // Serce „zapisz obiekt" leży WEWNĄTRZ linku karty. Gdyby przestało
    // zatrzymywać zdarzenie, jedno dotknięcie serca liczyłoby się też jako
    // klik w ofertę — i CTR listy zacząłby rosnąć bez powodu.
    const serce = czytaj("src/components/hotels/favorite-button.tsx");
    assert.equal(serce.includes("e.stopPropagation()"), true);
    assert.equal(serce.includes("e.preventDefault()"), true);
  });
});

// ── §6: trzy różne momenty lejka to trzy różne zdarzenia ────────────────
describe("wyniki, klik w ofertę i otwarcie oferty to OSOBNE zdarzenia (§6)", () => {
  it("lista wyników wysyła hotel_results_loaded dopiero po skanie", () => {
    const tresc = czytaj("src/app/hotele/szukaj/_components/results-list.tsx");
    assert.equal(tresc.includes(`track("hotel_results_loaded"`), true);
    // Bez tego warunku zdarzenie raportowałoby zero dostępnych obiektów
    // przy każdym wyszukiwaniu, bo ceny dolatują strumieniem po renderze.
    assert.equal(tresc.includes("if (!scanComplete) return;"), true);
  });

  it("każdy z trzech momentów ma własne zdarzenie i nie ma równoległych duplikatów", () => {
    const wysylane = zdarzeniaWysylane();
    for (const nazwa of ["hotel_results_loaded", "hotel_card_click", "hotel_detail_view"]) {
      assert.equal(wysylane.has(nazwa), true, `${nazwa} nie jest wysyłane`);
    }
    // `landing_cta_click` był drugim, równoległym zdarzeniem dla tych samych
    // klików; został usunięty na rzecz `seo_cta_click`.
    assert.equal(TRACK_TS.includes("landing_cta_click: {"), false);
  });
});

// ── §7 + §11F: zamiar rezerwacji tylko z jawnej akcji ───────────────────
describe("booking_intent leci wyłącznie po jawnym działaniu użytkownika (test F)", () => {
  const ROOMS = "src/app/hotele/[hotelId]/_components/rooms-section.tsx";

  it("ma dokładnie jeden emiter i jest nim handler kliknięcia", () => {
    const emitery = zdarzeniaWysylane().get("booking_intent") ?? [];
    assert.deepEqual([...new Set(emitery)], [ROOMS]);

    const tresc = czytaj(ROOMS);
    assert.equal((tresc.match(/track\("booking_intent"/g) ?? []).length, 1);
    assert.equal(tresc.includes("const onReservationClick = () => {"), true);
    assert.equal(tresc.includes("onClick={onReservationClick}"), true);
  });

  it("NIE jest wysyłane z renderu strony ani z efektu", () => {
    for (const plik of wszystkieZrodla()) {
      const tresc = fs.readFileSync(plik, "utf8");
      if (!tresc.includes("booking_intent")) continue;
      // TrackView odpala się na montażu — to byłby pomiar odsłony, nie zamiaru.
      assert.equal(
        /event=\{?"booking_intent"/.test(tresc),
        false,
        `${plik}: booking_intent przez TrackView = pomiar z renderu`,
      );
      // Dalsza część dotyczy tylko plikow, ktore FAKTYCZNIE wysylaja zdarzenie.
      // Sam katalog typow tez zawiera slowo „booking_intent", a nie wysyla nic.
      if (!tresc.includes(`track("booking_intent"`)) continue;
      // Wywołanie w efekcie znaczyłoby „samo wejście na stronę to zamiar".
      const przedWywolaniem = tresc.slice(0, tresc.indexOf(`track("booking_intent"`));
      const ostatniHandler = przedWywolaniem.lastIndexOf("onReservationClick = () => {");
      const ostatniEfekt = przedWywolaniem.lastIndexOf("useEffect(");
      assert.equal(
        ostatniHandler > ostatniEfekt,
        true,
        `${plik}: booking_intent wygląda na wysyłane z useEffect`,
      );
    }
  });

  it("jest czymś INNYM niż checkout_view — inaczej nie mierzyłby niczego nowego", () => {
    const rezerwacja = czytaj("src/app/hotele/rezerwacja/page.tsx");
    assert.equal(rezerwacja.includes("checkout_view"), true);
    assert.equal(rezerwacja.includes("booking_intent"), false);
  });
});
