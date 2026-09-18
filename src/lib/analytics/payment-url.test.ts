import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { analyticsPagePath } from "./page-path";
import {
  PARAMETRY_WYMAGANE_PRZEZ_FLOW,
  SEKRETY_W_ADRESIE,
  stripPaymentSecrets,
} from "./payment-url";

const KORZEN = process.cwd();
const czytaj = (p: string) => fs.readFileSync(path.join(KORZEN, p), "utf8");

// Realny adres powrotu ze Stripe'a (kształt zmierzony na produkcji).
// Sekret jest ZMYŚLONY — nigdy nie używamy prawdziwego w testach.
const ADRES_POWROTU =
  "https://helptravel.pl/hotele/rezerwacja/return" +
  "?sid=bs_01a0b563c4b6" +
  "&payment_intent=pi_3QxFAKE123" +
  "&payment_intent_client_secret=pi_3QxFAKE123_secret_ZMYSLONY" +
  "&redirect_status=succeeded";

// ── Test A + B: Clarity nie ma jak zobaczyć adresu z sekretem ────────────
describe("Clarity nie nagrywa stron powrotu z płatności (testy A, B)", () => {
  const CLARITY = czytaj("src/components/site/microsoft-clarity.tsx");

  it("obie strony powrotu są na liście tras bez nagrywania", () => {
    assert.equal(CLARITY.includes('"/hotele/rezerwacja/return"'), true);
    assert.equal(CLARITY.includes('"/loty/platnosc/return"'), true);
  });

  it("wrażliwa trasa WYŁĄCZA tag — komponent nie renderuje niczego", () => {
    // Bramka musi siedzieć w warunku decydującym o renderze, nie w komentarzu.
    assert.match(CLARITY, /analyticsAllowed =[\s\S]{0,160}!czyTrasaWrazliwa\(pathname\)/);
    assert.equal(CLARITY.includes("if (!analyticsAllowed) return null;"), true);
  });

  it("dopasowanie obejmuje podścieżki, a nie tylko dokładny adres", () => {
    assert.equal(CLARITY.includes("pathname.startsWith(`${t}/`)"), true);
  });

  it("gwarancja NIE zależy od kolejności — bramka jest przed wstawieniem skryptu", () => {
    // To jest sedno testu B. `sid` ZOSTAJE w adresie (czyta go strona powrotu),
    // więc czyszczenie adresu samo z siebie nie chroni przed Clarity.
    // Chroni wyłącznie to, że tag w ogóle nie powstaje na tej trasie.
    const indeksBramki = CLARITY.indexOf("czyTrasaWrazliwa(pathname)");
    const indeksSkryptu = CLARITY.indexOf("<Script id=\"ms-clarity\"");
    assert.equal(indeksBramki !== -1 && indeksSkryptu !== -1, true);
    assert.equal(indeksBramki < indeksSkryptu, true, "bramka musi poprzedzać wstawienie tagu");
  });

  it("`sid` NIE jest wycinany z adresu — dlatego bramka jest konieczna", () => {
    const czysty = stripPaymentSecrets(ADRES_POWROTU);
    assert.equal(czysty !== null && czysty.includes("sid=bs_01a0b563c4b6"), true);
  });
});

// ── Test E: czysty adres po przetworzeniu ────────────────────────────────
describe("adres po przetworzeniu nie niesie poświadczenia (test E)", () => {
  it("usuwa sekret Stripe'a z realnego adresu powrotu", () => {
    const czysty = stripPaymentSecrets(ADRES_POWROTU);
    assert.equal(czysty, "https://helptravel.pl/hotele/rezerwacja/return?sid=bs_01a0b563c4b6&payment_intent=pi_3QxFAKE123&redirect_status=succeeded");
    assert.equal(czysty!.includes("ZMYSLONY"), false);
    assert.equal(czysty!.includes("client_secret"), false);
  });

  it("usuwa też sekret SetupIntent i gołe `client_secret`", () => {
    const wynik = stripPaymentSecrets("/loty/platnosc/return?setup_intent_client_secret=seti_FAKE_secret_X&client_secret=cs_FAKE&sid=fs_9");
    assert.equal(wynik, "/loty/platnosc/return?sid=fs_9");
  });

  it("zwraca `null`, gdy nie ma czego usuwać — nie dotykamy historii bez powodu", () => {
    assert.equal(stripPaymentSecrets("https://helptravel.pl/hotele/rezerwacja/return?sid=bs_1"), null);
    assert.equal(stripPaymentSecrets("/kierunki/malaga-spain"), null);
    assert.equal(stripPaymentSecrets("to nie jest adres"), null);
  });

  it("zachowuje rodzaj adresu: bezwzględny zostaje bezwzględny", () => {
    assert.equal(stripPaymentSecrets(ADRES_POWROTU)!.startsWith("https://helptravel.pl/"), true);
    assert.equal(stripPaymentSecrets("/x?client_secret=a&b=1")!.startsWith("/x"), true);
  });
});

// ── Test D: lejek rezerwacji dostaje wszystko, czego potrzebuje ──────────
describe("finalizacja rezerwacji nie traci swoich parametrów (test D)", () => {
  it("listy „sekrety” i „potrzebne przez flow” są ROZŁĄCZNE", () => {
    // Gdyby się przecięły, wycięlibyśmy parametr, od którego zależą pieniądze.
    const kolizje = PARAMETRY_WYMAGANE_PRZEZ_FLOW.filter((p) =>
      (SEKRETY_W_ADRESIE as readonly string[]).includes(p),
    );
    assert.deepEqual(kolizje, []);
  });

  it("po czyszczeniu wszystkie parametry flow nadal są w adresie", () => {
    const czysty = stripPaymentSecrets(ADRES_POWROTU)!;
    for (const klucz of PARAMETRY_WYMAGANE_PRZEZ_FLOW) {
      assert.equal(new URL(czysty).searchParams.has(klucz), true, `zgubiono ${klucz}`);
    }
  });

  it("strona powrotu hotelu nadal czyta `sid` i `payment_intent`", () => {
    const strona = czytaj("src/app/hotele/rezerwacja/return/page.tsx");
    assert.equal(strona.includes("const { sid, payment_intent: paymentIntentId } = await searchParams;"), true);
    // Bez `sid` strona pokazuje błąd — to jest powód, dla którego go nie ruszamy.
    assert.equal(strona.includes("if (!sid) {"), true);
  });

  it("ŻADEN kod poza analityką nie czyta usuwanych parametrów", () => {
    // Warunek wejścia na listę sekretów. Gdyby ktoś zaczął czytać któryś
    // z nich, usuwanie go z adresu zaczęłoby psuć produkt — i ten test padnie.
    const zrodla: string[] = [];
    (function chodz(katalog: string) {
      for (const wpis of fs.readdirSync(katalog, { withFileTypes: true })) {
        const p = path.join(katalog, wpis.name);
        if (wpis.isDirectory()) chodz(p);
        else if (/\.tsx?$/.test(wpis.name) && !/\.test\.tsx?$/.test(wpis.name)) zrodla.push(p);
      }
    })(path.join(KORZEN, "src"));

    const dozwolone = ["lib\\analytics\\payment-url.ts", "lib/analytics/payment-url.ts", "lib\\analytics\\page-path.ts", "lib/analytics/page-path.ts"];
    for (const plik of zrodla) {
      if (dozwolone.some((d) => plik.endsWith(d))) continue;
      const bezKomentarzy = fs
        .readFileSync(plik, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      for (const sekret of SEKRETY_W_ADRESIE) {
        assert.equal(
          bezKomentarzy.includes(sekret),
          false,
          `${path.relative(KORZEN, plik)} czyta „${sekret}" — nie wolno go wycinać z adresu`,
        );
      }
    }
  });
});

// ── Fix u ŹRÓDŁA: middleware odcina sekret przed renderem ───────────────
describe("middleware wycina poświadczenie zanim zobaczy je serwer", () => {
  const MW = czytaj("middleware.ts");

  it("przekierowuje, gdy adres niesie poświadczenie", () => {
    assert.equal(MW.includes("const bezSekretu = stripPaymentSecrets(request.nextUrl.href);"), true);
    assert.equal(MW.includes("NextResponse.redirect(bezSekretu, 307)"), true);
  });

  it("307 i `no-store` — to adres jednorazowy, nie kanoniczny", () => {
    // 301 zostałby zapamiętany przez przeglądarkę dla całej ścieżki powrotu.
    assert.equal(/NextResponse\.redirect\(bezSekretu, 307\)/.test(MW), true);
    assert.equal(MW.includes('res.headers.set("Cache-Control", "no-store");'), true);
  });

  it("robi to PRZED pozostałymi regułami — sekret nie dożywa renderu", () => {
    const iSekret = MW.indexOf("stripPaymentSecrets(request.nextUrl.href)");
    const iLang = MW.indexOf("stripLangParam(request.nextUrl.href)");
    assert.equal(iSekret !== -1 && iLang !== -1, true);
    assert.equal(iSekret < iLang, true, "reguła sekretu musi być pierwsza");
  });

  it("matcher obejmuje KAŻDY usuwany parametr — inaczej middleware się nie odpali", () => {
    for (const klucz of SEKRETY_W_ADRESIE) {
      assert.equal(
        MW.includes(`has: [{ type: "query", key: "${klucz}" }]`),
        true,
        `brak wpisu w matcherze dla ${klucz}`,
      );
    }
  });

  it("nie zapętla się: po przekierowaniu nie ma już czego usuwać", () => {
    const czysty = stripPaymentSecrets(ADRES_POWROTU)!;
    assert.equal(stripPaymentSecrets(czysty), null);
  });
});

// ── Test C + F: GA4 nadal sanityzuje ────────────────────────────────────
describe("GA4 nadal nie dostaje sekretów ani PII (testy C, F)", () => {
  it("sekret i sesja są utajniane w ścieżce analitycznej", () => {
    const sciezka = analyticsPagePath(
      "/hotele/rezerwacja/return",
      "sid=bs_01a0b563c4b6&payment_intent=pi_3QxFAKE123&payment_intent_client_secret=pi_3QxFAKE123_secret_ZMYSLONY",
    );
    assert.equal(sciezka.includes("ZMYSLONY"), false);
    assert.equal(sciezka.includes("bs_01a0b563c4b6"), false);
    assert.equal(sciezka.includes("pi_3QxFAKE123"), false);
  });

  it("dane osobowe w adresie nie wychodzą do GA4", () => {
    const sciezka = analyticsPagePath("/hotele/rezerwacja", "email=jan.kowalski@example.com&phone=600100200");
    assert.equal(sciezka.includes("jan.kowalski@example.com"), false);
    assert.equal(sciezka.includes("600100200"), false);
  });

  it("dwie warstwy są niezależne: GA4 utajnia nawet adres NIEczyszczony", () => {
    // Czyszczenie adresu i sanityzacja GA4 nie mogą być od siebie zależne —
    // gdyby jedno padło, drugie ma nadal chronić.
    const brudny = analyticsPagePath("/hotele/rezerwacja/return", "payment_intent_client_secret=pi_secret_ZMYSLONY");
    assert.equal(brudny.includes("ZMYSLONY"), false);
  });
});
