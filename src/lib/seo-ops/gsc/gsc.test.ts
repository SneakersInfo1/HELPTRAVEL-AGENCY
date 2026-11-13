import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  brandSplit,
  comparePeriods,
  consistencyAnomalies,
  pageAnomalies,
  periodAnomalies,
  rankOpportunities,
  referenceCtrForPosition,
  scoreOpportunity,
} from "./analysis";
import { GscCsvError, inDateRange, parseGscCsv, splitCsvLine, totals } from "./csv";
import { classifyQuery, classifyUrl, isBrandQuery, isHighRiskIntent } from "./segments";

const BOM = "﻿";

describe("parseGscCsv", () => {
  it("czyta eksport z polskiego interfejsu z BOM i CTR jako ułamkiem", () => {
    const table = parseGscCsv(
      `${BOM}Najpopularniejsze strony,Kliknięcia,Wyświetlenia,CTR,Pozycja\nhttps://helptravel.pl/,860,2437,0.3529,7.24\nhttps://helptravel.pl/cennik,4,1332,0.003,1.3\n`,
    );
    assert.equal(table.dimension, "Najpopularniejsze strony");
    assert.equal(table.rows.length, 2);
    assert.deepEqual(table.rows[0], { key: "https://helptravel.pl/", clicks: 860, impressions: 2437, ctr: 0.3529, position: 7.24 });
  });

  it("czyta CTR w procentach z przecinkiem dziesiętnym i nagłówki angielskie", () => {
    const table = parseGscCsv(`Query,Clicks,Impressions,CTR,Position\n"ateny, czy rzym",5,39,"12,82%","3,33"\n`);
    assert.equal(table.rows[0].key, "ateny, czy rzym");
    assert.ok(Math.abs(table.rows[0].ctr - 0.1282) < 1e-9);
    assert.equal(table.rows[0].position, 3.33);
  });

  it("odrzuca plik z nieznanym układem kolumn zamiast zwracać zera", () => {
    assert.throws(() => parseGscCsv("Strona,Kliknięcia,Wyświetlenia,CTR\nx,1,2,0.5\n"), GscCsvError);
    assert.throws(() => parseGscCsv("Strona,Kliknięcia,Sesje,CTR,Pozycja\nx,1,2,0.5,1\n"), GscCsvError);
    assert.throws(() => parseGscCsv(""), GscCsvError);
  });

  it("odrzuca wiersz z nie-liczbą i wiersz z kliknięciami ponad wyświetlenia", () => {
    assert.throws(() => parseGscCsv("Strona,Kliknięcia,Wyświetlenia,CTR,Pozycja\nx,abc,2,0.5,1\n"), /nie jest liczbą/);
    assert.throws(() => parseGscCsv("Strona,Kliknięcia,Wyświetlenia,CTR,Pozycja\nx,5,2,0.5,1\n"), /więcej niż wyświetleń/);
  });

  it("pole w cudzysłowie ze znakiem nowej linii to jeden rekord", () => {
    const table = parseGscCsv('Query,Clicks,Impressions,CTR,Position\n"-site:x.com \n-site:t.co ""electra \nmetropolis""",0,6,0,15.17\nmadera,3,192,0.0156,3.01\n');
    assert.equal(table.rows.length, 2);
    assert.equal(table.rows[0].key, '-site:x.com -site:t.co "electra metropolis"');
    assert.equal(table.rows[1].key, "madera");
  });

  it("splitCsvLine obsługuje podwojony cudzysłów", () => {
    assert.deepEqual(splitCsvLine('a,"b ""c"", d",e'), ["a", 'b "c", d', "e"]);
  });
});

describe("totals i okresy", () => {
  const rows = [
    { key: "2026-09-12", clicks: 10, impressions: 100, ctr: 0.1, position: 5 },
    { key: "2026-09-13", clicks: 0, impressions: 300, ctr: 0, position: 15 },
    { key: "2026-10-12", clicks: 2, impressions: 800, ctr: 0.0025, position: 11 },
  ];

  it("CTR liczy z sum, a pozycję waży wyświetleniami", () => {
    const t = totals(rows.slice(0, 2));
    assert.equal(t.clicks, 10);
    assert.equal(t.impressions, 400);
    assert.equal(t.ctr, 0.025);
    assert.equal(t.position, 12.5);
  });

  it("pusta tabela nie dzieli przez zero", () => {
    assert.deepEqual(totals([]), { rows: 0, clicks: 0, impressions: 0, ctr: 0, position: 0 });
  });

  it("porównanie okresów wykrywa wzrost wyświetleń przy spadku kliknięć", () => {
    const comparison = comparePeriods(inDateRange(rows, "2026-09-12", "2026-10-11"), inDateRange(rows, "2026-10-12", "2026-11-10"));
    assert.equal(comparison.previous.clicks, 10);
    assert.equal(comparison.current.impressions, 800);
    assert.equal(comparison.impressionsChange, 1);
    assert.equal(comparison.clicksChange, -0.8);
    const anomalies = periodAnomalies(comparison);
    assert.equal(anomalies.length, 1);
    assert.equal(anomalies[0].kind, "impressions_up_clicks_down");
  });

  it("okres bez danych bazowych daje null, a nie nieskończoność", () => {
    const comparison = comparePeriods([], rows);
    assert.equal(comparison.clicksChange, null);
    assert.deepEqual(periodAnomalies(comparison), []);
  });
});

describe("classifyUrl", () => {
  it("rozróżnia rodziny adresów", () => {
    assert.equal(classifyUrl("https://helptravel.pl/").segment, "home");
    assert.equal(classifyUrl("https://helptravel.pl/porownanie").segment, "comparison_hub");
    const comparison = classifyUrl("https://helptravel.pl/porownanie/athens-greece-vs-rome-italy");
    assert.equal(comparison.segment, "comparison");
    assert.equal(comparison.slug, "athens-greece-vs-rome-italy");
    const month = classifyUrl("https://helptravel.pl/kierunki/barcelona-spain/styczen");
    assert.deepEqual([month.segment, month.slug, month.month], ["month", "barcelona-spain", "styczen"]);
    assert.equal(classifyUrl("https://helptravel.pl/kierunki/barcelona-spain").segment, "guide");
    assert.equal(classifyUrl("https://helptravel.pl/wyjazdy/city-break").segment, "mood_hub");
    assert.equal(classifyUrl("https://helptravel.pl/hotele/w/barcelona").segment, "city_hotels");
    assert.equal(classifyUrl("https://helptravel.pl/cennik").segment, "info");
  });

  it("oznacza warianty, które nie powinny mieć własnych wyświetleń", () => {
    assert.equal(classifyUrl("https://helptravel.pl/redakcja?lang=en").anomaly, "lang_param");
    assert.equal(classifyUrl("https://helptravel.pl/en/kierunki/innsbruck-austria").segment, "legacy");
    assert.equal(classifyUrl("https://helptravel.pl/planner?destination=Delhi").anomaly, "planner");
    // Adres z polskim znakiem w ścieżce (zakodowany i niezakodowany) to ten sam przypadek.
    assert.equal(classifyUrl("https://helptravel.pl/porównanie/x-vs-y").anomaly, "non_ascii_path");
    assert.equal(classifyUrl("https://helptravel.pl/por%C3%B3wnanie/x-vs-y").anomaly, "non_ascii_path");
    const hotel = classifyUrl("https://helptravel.pl/hotele/lp65548ff6?checkin=2026-09-25&checkout=2026-09-27");
    assert.deepEqual([hotel.segment, hotel.anomaly], ["hotel_detail", "query_string"]);
  });

  it("nie wywraca się na śmieciowym wejściu", () => {
    assert.equal(classifyUrl("http://[zły").segment, "other");
    assert.equal(classifyUrl("https://helptravel.pl/kierunki/%E0%A4%A").segment, "guide");
  });
});

describe("marka i intencja zapytań", () => {
  it("rozpoznaje warianty i literówki marki", () => {
    for (const q of ["helptravel pl", "help travel", "HelpTravel.pl", "help-travel", "helptrav", "travelhelp", "help travel opinie", "heltravel"]) {
      assert.equal(isBrandQuery(q), true, q);
    }
  });

  it("nie uznaje ogólnych zapytań za markę", () => {
    for (const q of ["travel", "how travel", "city break", "travel planner", "madera czy teneryfa", "help"]) {
      assert.equal(isBrandQuery(q), false, q);
    }
  });

  it("klasyfikuje intencje", () => {
    assert.equal(classifyQuery("barcelona pogoda listopad"), "weather_month");
    assert.equal(classifyQuery("walencja w styczniu"), "weather_month");
    assert.equal(classifyQuery("madera czy teneryfa"), "comparison");
    assert.equal(classifyQuery("teneryfa a madera"), "comparison");
    assert.equal(classifyQuery("tani city break"), "city_break");
    assert.equal(classifyQuery("hotel city break"), "city_break");
    assert.equal(classifyQuery("hotele barcelona"), "hotels");
    assert.equal(classifyQuery("helptravel"), "brand");
    assert.equal(classifyQuery("madera"), "destination_generic");
  });

  it("zapytania o dokumenty i bezpieczeństwo są wysokiego ryzyka", () => {
    for (const q of ["czy do turcji potrzebna wiza", "egipt bezpieczeństwo msz", "maroko paszport czy dowód"]) {
      assert.equal(isHighRiskIntent(classifyQuery(q)), true, q);
    }
    assert.equal(isHighRiskIntent(classifyQuery("madera czy teneryfa")), false);
  });
});

describe("anomalie i scoring", () => {
  it("brandSplit liczy dolne ograniczenie względem usługi", () => {
    const split = brandSplit(
      [
        { key: "helptravel", clicks: 80, impressions: 100, ctr: 0.8, position: 1 },
        { key: "ateny czy rzym", clicks: 5, impressions: 40, ctr: 0.125, position: 3 },
      ],
      100,
    );
    assert.equal(split.brand.clicks, 80);
    assert.equal(split.nonBrand.clicks, 5);
    assert.ok(Math.abs(split.brandShareOfExport - 80 / 85) < 1e-9);
    assert.equal(split.brandShareOfPropertyLowerBound, 0.8);
    assert.equal(brandSplit([]).brandShareOfPropertyLowerBound, null);
  });

  it("krzywa odniesienia jest monotoniczna i interpoluje", () => {
    let previous = Infinity;
    for (const position of [1, 2, 3.5, 5, 7.5, 10, 12, 20, 40, 80]) {
      const value = referenceCtrForPosition(position);
      assert.ok(value <= previous, `poz. ${position}`);
      previous = value;
    }
    assert.equal(referenceCtrForPosition(0), 0);
    assert.ok(Math.abs(referenceCtrForPosition(3.5) - 0.085) < 1e-9);
  });

  it("wykrywa adres legacy, adres z parametrem i CTR daleko poniżej odniesienia", () => {
    const anomalies = pageAnomalies([
      { key: "https://helptravel.pl/en/kierunki/x", clicks: 0, impressions: 7, ctr: 0, position: 9 },
      { key: "https://helptravel.pl/redakcja?lang=en", clicks: 0, impressions: 4, ctr: 0, position: 3 },
      { key: "https://helptravel.pl/o-nas", clicks: 4, impressions: 1367, ctr: 0.003, position: 1.3 },
      { key: "https://helptravel.pl/porownanie/a-vs-b", clicks: 30, impressions: 600, ctr: 0.05, position: 4.8 },
    ]);
    assert.deepEqual(
      anomalies.map((a) => a.kind),
      ["legacy_url_with_impressions", "param_url_with_impressions", "ctr_far_below_reference"],
    );
    assert.equal(anomalies[2].subject, "https://helptravel.pl/o-nas");
  });

  it("suma po adresach ponad sumę usługi jest opisana, a nie traktowana jak błąd danych", () => {
    const rows = [{ key: "https://helptravel.pl/", clicks: 1, impressions: 500, ctr: 0.002, position: 3 }];
    assert.equal(consistencyAnomalies(rows, 400)[0].kind, "sum_of_pages_exceeds_property");
    assert.deepEqual(consistencyAnomalies(rows, 490), []);
  });

  it("scoring: porównanie z luką CTR wygrywa ze stroną miesiąca o tych samych liczbach", () => {
    const base = { clicks: 2, impressions: 1000, position: 5 };
    const comparison = scoreOpportunity({ url: "https://helptravel.pl/porownanie/a-vs-b", ...base });
    const month = scoreOpportunity({ url: "https://helptravel.pl/kierunki/a/styczen", ...base });
    const info = scoreOpportunity({ url: "https://helptravel.pl/cennik", ...base });
    assert.ok(comparison.score > month.score);
    assert.ok(month.score > info.score);
    assert.equal(comparison.ctrGapClicks, 48);
  });

  it("scoring: karta hotelu i adres legacy mają zero, strona bez luki CTR też", () => {
    assert.equal(scoreOpportunity({ url: "https://helptravel.pl/hotele/lp1a2b", clicks: 0, impressions: 500, position: 3 }).score, 0);
    assert.equal(scoreOpportunity({ url: "https://helptravel.pl/en/x", clicks: 0, impressions: 500, position: 3 }).score, 0);
    assert.equal(scoreOpportunity({ url: "https://helptravel.pl/porownanie/a-vs-b", clicks: 400, impressions: 500, position: 3 }).score, 0);
  });

  it("scoring: pozycje 11–20 dostają składnik odległości do top 10", () => {
    const hub = scoreOpportunity({ url: "https://helptravel.pl/wyjazdy/city-break", clicks: 11, impressions: 2506, position: 17.78 });
    assert.ok(hub.score > 20, String(hub.score));
  });

  it("ranking jest deterministyczny i pomija zera", () => {
    const rows = [
      { key: "https://helptravel.pl/porownanie/b-vs-c", clicks: 0, impressions: 100, ctr: 0, position: 5 },
      { key: "https://helptravel.pl/porownanie/a-vs-b", clicks: 0, impressions: 100, ctr: 0, position: 5 },
      { key: "https://helptravel.pl/hotele/lp1a2b", clicks: 0, impressions: 900, ctr: 0, position: 2 },
    ];
    const ranked = rankOpportunities(rows);
    assert.deepEqual(ranked.map((r) => r.url), ["https://helptravel.pl/porownanie/a-vs-b", "https://helptravel.pl/porownanie/b-vs-c"]);
    assert.deepEqual(rankOpportunities([...rows].reverse()).map((r) => r.url), ranked.map((r) => r.url));
  });
});

// ── Kontrola na prawdziwym eksporcie ─────────────────────────────────────
// Pliki leżą poza repo (seo-private/, repo jest publiczne). Gdy ich nie ma
// (CI, świeży checkout), blok jest pomijany JAWNIE — widać to w raporcie testów.
const realDir = join(process.cwd(), "seo-private", "gsc", "2026-11-10");
const hasReal = existsSync(join(realDir, "gsc_daily_2026-08-11_2026-11-10.csv"));

describe("eksport GSC 11.08–10.11.2026 — liczby z misji", { skip: hasReal ? false : "brak seo-private/gsc/2026-11-10" }, () => {
  const read = (name: string) => parseGscCsv(readFileSync(join(realDir, name), "utf8")).rows;

  it("dzienne: 92 dni, 1166 kliknięć, 35393 wyświetlenia, CTR 3,294%", () => {
    const daily = read("gsc_daily_2026-08-11_2026-11-10.csv");
    const t = totals(daily);
    assert.equal(daily.length, 92);
    assert.equal(t.clicks, 1166);
    assert.equal(t.impressions, 35393);
    assert.equal((t.ctr * 100).toFixed(3), "3.294");
  });

  it("okna 30-dniowe: 129/6389 → 83/18398", () => {
    const daily = read("gsc_daily_2026-08-11_2026-11-10.csv");
    const comparison = comparePeriods(inDateRange(daily, "2026-09-12", "2026-10-11"), inDateRange(daily, "2026-10-12", "2026-11-10"));
    assert.deepEqual([comparison.previous.clicks, comparison.previous.impressions], [129, 6389]);
    assert.deepEqual([comparison.current.clicks, comparison.current.impressions], [83, 18398]);
    assert.equal((comparison.previous.ctr * 100).toFixed(3), "2.019");
    assert.equal((comparison.current.ctr * 100).toFixed(3), "0.451");
    assert.equal(((comparison.impressionsChange ?? 0) * 100).toFixed(0), "188");
    assert.equal(((comparison.clicksChange ?? 0) * 100).toFixed(1), "-35.7");
    assert.equal(periodAnomalies(comparison)[0]?.kind, "impressions_up_clicks_down");
  });

  it("strony: 1000 adresów, 1200 kliknięć, 43262 wyświetlenia; porównania 52/178/9432 + hub 3/1206", () => {
    const pages = read("gsc_pages_top1000.csv");
    const t = totals(pages);
    assert.deepEqual([pages.length, t.clicks, t.impressions], [1000, 1200, 43262]);
    const comparisons = totals(pages.filter((row) => classifyUrl(row.key).segment === "comparison"));
    assert.deepEqual([comparisons.rows, comparisons.clicks, comparisons.impressions], [52, 178, 9432]);
    const hub = totals(pages.filter((row) => classifyUrl(row.key).segment === "comparison_hub"));
    assert.deepEqual([hub.rows, hub.clicks, hub.impressions], [1, 3, 1206]);
    // „Adresy zawierające /kierunki/" z misji (818 / 70 / 19236) to dopasowanie
    // podciągu — obejmuje też /en/kierunki/ i warianty z parametrami.
    const containing = totals(pages.filter((row) => row.key.includes("/kierunki/")));
    assert.deepEqual([containing.rows, containing.clicks, containing.impressions], [818, 70, 19236]);
  });

  it("zapytania: 853 kliknięcia w eksporcie, marka co najmniej 826", () => {
    const queries = read("gsc_queries_top1000.csv");
    assert.equal(totals(queries).clicks, 853);
    const split = brandSplit(queries, 1166);
    assert.ok(split.brand.clicks >= 826, `marka ${split.brand.clicks}`);
    assert.ok((split.brandShareOfPropertyLowerBound ?? 0) >= 0.708);
  });
});
