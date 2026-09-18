import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  UTAJNIONE,
  analyticsPagePath,
  getLandingPath,
  rememberLandingPath,
  resetLandingPathForTests,
} from "./page-path";

// Test A (brief §11A): w `page_path` NIE MA zduplikowanego query stringa.
//
// Punkt wyjścia to realne wiersze z eksploracji GA4 — ~47% miało dwa `?`.
// Każdy z tych przypadków jest tu odtworzony dosłownie, żeby regresja
// wróciła jako czerwony test, a nie jako kolejny miesiąc nieufnych raportów.
describe("analyticsPagePath — jeden pathname + jeden query string (test A)", () => {
  it("nie podwaja query, gdy pathname NIESIE JUŻ query (realny objaw /?tab=loty?tab=loty)", () => {
    assert.equal(analyticsPagePath("/?tab=loty", "tab=loty"), "/?tab=loty");
    assert.equal(analyticsPagePath("/?tab=loty", "?tab=loty"), "/?tab=loty");
  });

  it("nie podwaja query na stronie wyników hoteli (realny objaw /hotele/szukaj?…?…)", () => {
    assert.equal(
      analyticsPagePath("/hotele/szukaj?destination=Barcelona&adults=2", "destination=Barcelona&adults=2"),
      "/hotele/szukaj?destination=Barcelona&adults=2",
    );
  });

  it("traktuje nadmiarowy `?` w samym query jak separator i skleja duplikaty", () => {
    assert.equal(analyticsPagePath("/", "tab=loty?tab=loty"), "/?tab=loty");
    assert.equal(analyticsPagePath("/hotele/szukaj", "?a=1?a=1?a=1"), "/hotele/szukaj?a=1");
  });

  it("w wyniku jest NAJWYŻEJ jeden znak `?` — niezależnie od wejścia", () => {
    const wejscia: Array<[string, string]> = [
      ["/?tab=loty", "tab=loty"],
      ["/x?a=1?b=2", "a=1?b=2"],
      ["/?a=1", "?b=2"],
      ["/hotele/szukaj?x=1#sekcja", "x=1"],
      ["//?a=1", "a=1"],
    ];
    for (const [pathname, search] of wejscia) {
      const wynik = analyticsPagePath(pathname, search);
      assert.equal(
        wynik.split("?").length - 1 <= 1,
        true,
        `„${pathname}" + „${search}" dało ${wynik}`,
      );
      assert.equal(wynik.startsWith("/"), true, `„${wynik}" nie zaczyna się od /`);
    }
  });

  it("zachowuje różne wartości tego samego klucza (to legalny URL, nie duplikat)", () => {
    assert.equal(analyticsPagePath("/faq", "lang=en&lang=de"), "/faq?lang=en&lang=de");
  });

  it("ucina fragment `#…` — GA4 i tak go nie raportuje w page_path", () => {
    assert.equal(analyticsPagePath("/przewodniki#sekcja-2", null), "/przewodniki");
    assert.equal(analyticsPagePath("/przewodniki#sekcja-2", "a=1"), "/przewodniki?a=1");
  });

  it("pustą i brakującą ścieżkę normalizuje do `/`", () => {
    assert.equal(analyticsPagePath("", null), "/");
    assert.equal(analyticsPagePath(null, null), "/");
    assert.equal(analyticsPagePath(undefined, undefined), "/");
    assert.equal(analyticsPagePath("kierunki", null), "/kierunki");
  });

  it("odzyskuje query ze ścieżki, gdy `search` jest pusty (useSearchParams bez wartości)", () => {
    // Wyrzucenie tej części zgubiłoby parametry — dlatego jest awaryjnym źródłem.
    assert.equal(analyticsPagePath("/?tab=loty", ""), "/?tab=loty");
    assert.equal(analyticsPagePath("/?tab=loty", null), "/?tab=loty");
  });

  it("zostawia ścieżkę bez query nietkniętą", () => {
    assert.equal(analyticsPagePath("/kierunki/kreta-greece", ""), "/kierunki/kreta-greece");
    assert.equal(analyticsPagePath("/kierunki/kreta-greece/lipiec", null), "/kierunki/kreta-greece/lipiec");
  });
});

// Test G (brief §11G): zero danych wrażliwych w parametrach analitycznych.
//
// URL powrotu ze Stripe'a niósł do GA4 `payment_intent_client_secret` (czyli
// poświadczenie pozwalające operować na tym PaymentIntent z przeglądarki)
// oraz `sid` — klucz sesji rezerwacji w Redisie.
describe("analyticsPagePath — utajnia poświadczenia i dane osobowe (test G)", () => {
  it("utajnia sekret Stripe'a i sesję rezerwacji na stronie powrotu", () => {
    const wynik = analyticsPagePath(
      "/hotele/rezerwacja/return",
      "sid=bs_abc123&payment_intent=pi_3Qx&payment_intent_client_secret=pi_3Qx_secret_ZZZ&redirect_status=succeeded",
    );
    assert.equal(
      wynik,
      `/hotele/rezerwacja/return?sid=${UTAJNIONE}&payment_intent=${UTAJNIONE}&payment_intent_client_secret=${UTAJNIONE}&redirect_status=succeeded`,
    );
    assert.equal(wynik.includes("secret_ZZZ"), false);
    assert.equal(wynik.includes("bs_abc123"), false);
    assert.equal(wynik.includes("pi_3Qx"), false);
  });

  it("utajnia typowe nośniki danych osobowych, gdyby trafiły do URL-a", () => {
    for (const para of ["email=jan@example.com", "phone=600100200", "token=eyJhbG", "firstName=Jan"]) {
      const wynik = analyticsPagePath("/hotele/rezerwacja", para);
      const wartosc = para.split("=")[1] ?? "";
      assert.equal(wynik.includes(wartosc), false, `„${para}" wyciekło w ${wynik}`);
      assert.equal(wynik.includes(UTAJNIONE), true, `„${para}" nie zostało utajnione`);
    }
  });

  it("KLUCZ zostaje, ginie tylko wartość — kardynalność raportu się nie psuje", () => {
    assert.equal(
      analyticsPagePath("/hotele/rezerwacja/return", "payment_intent=pi_1"),
      `/hotele/rezerwacja/return?payment_intent=${UTAJNIONE}`,
    );
    assert.equal(
      analyticsPagePath("/hotele/rezerwacja/return", "payment_intent=pi_2"),
      `/hotele/rezerwacja/return?payment_intent=${UTAJNIONE}`,
    );
  });

  it("`source` utajnia TYLKO na ścieżkach płatności — poza nimi to zwykły wymiar", () => {
    // Na powrocie z płatności `source` to identyfikator źródła płatności Stripe'a.
    assert.equal(
      analyticsPagePath("/hotele/rezerwacja/return", "source=src_1H8"),
      `/hotele/rezerwacja/return?source=${UTAJNIONE}`,
    );
    // Na treści `?source=newsletter` to użyteczna informacja marketingowa.
    assert.equal(analyticsPagePath("/przewodniki", "source=newsletter"), "/przewodniki?source=newsletter");
  });

  it("utajnia offerId — inaczej każde wejście do kasy to osobny wiersz w GA4", () => {
    // Zmierzone na realnym adresie: `offerId` LiteAPI ma ~1500 znaków, a GA4
    // przycina wartość parametru zdarzenia do 100. Bez utajnienia `page_path`
    // strony kasy docierał UCIĘTY i nie dawał się z niczym zestawić.
    const dlugiOffer = "3gAWonJzkd4AEaRzcmlk" + "A".repeat(1400);
    const wynik = analyticsPagePath("/hotele/rezerwacja", `hotelId=lp50b05&offerId=${dlugiOffer}&price=2554&cur=PLN`);
    assert.equal(wynik, `/hotele/rezerwacja?hotelId=lp50b05&offerId=${UTAJNIONE}&price=2554&cur=PLN`);
    assert.equal(wynik.length < 120, true, `ścieżka kasy wciąż długa: ${wynik.length} znaków`);
  });

  it("PRZEPUSZCZA parametry atrybucji — GA4 czyta źródło ruchu z page_location", () => {
    // To jest gwarancja, którą łatwo zepsuć przy okazji utajniania: GA4 czyta
    // utm_*, gclid i fbclid z `page_location`, a to pole składamy teraz sami.
    // Gdyby któryś z nich wpadł pod utajnienie albo zginął przy składaniu,
    // cały ruch płatny i kampanijny wylądowałby jako „direct" — czyli zamiast
    // naprawić atrybucję, zniszczylibyśmy tę, która działała.
    const wynik = analyticsPagePath(
      "/kierunki/malaga-spain",
      "utm_source=tiktok&utm_medium=social&utm_campaign=lato 2026&gclid=EAIaIQ&fbclid=IwAR",
    );
    assert.equal(wynik.includes("utm_source=tiktok"), true);
    assert.equal(wynik.includes("utm_medium=social"), true);
    assert.equal(wynik.includes("gclid=EAIaIQ"), true);
    assert.equal(wynik.includes("fbclid=IwAR"), true);
    // Spacja w wartości wraca zakodowana — składnia URL-a, ta sama wartość.
    assert.equal(wynik.includes("utm_campaign=lato%202026"), true);
  });

  it("nie rusza parametrów produktowych — one są potrzebne do analizy lejka", () => {
    assert.equal(
      analyticsPagePath("/hotele/szukaj", "destination=Kreta&checkin=2026-10-01&adults=2&rooms=1"),
      "/hotele/szukaj?destination=Kreta&checkin=2026-10-01&adults=2&rooms=1",
    );
  });
});

describe("rememberLandingPath — strona wejścia w pamięci ulotnej", () => {
  it("pamięta PIERWSZĄ ścieżkę i nie daje jej nadpisać", () => {
    resetLandingPathForTests();
    assert.equal(getLandingPath(), null);
    rememberLandingPath("/kierunki/kreta-greece/lipiec");
    rememberLandingPath("/hotele/szukaj?destination=Kreta");
    assert.equal(getLandingPath(), "/kierunki/kreta-greece/lipiec");
  });

  it("ignoruje puste wejście — brak danych to `null`, nie pusty string", () => {
    resetLandingPathForTests();
    rememberLandingPath("");
    assert.equal(getLandingPath(), null);
  });
});
