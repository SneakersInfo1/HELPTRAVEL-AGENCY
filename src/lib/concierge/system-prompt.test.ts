import assert from "node:assert/strict";
import { test } from "node:test";
import { SYSTEM_PROMPT } from "./system-prompt";

test("SYSTEM_PROMPT: zakaz zmyślania cen — wyłącznie wyniki narzędzi", () => {
  assert.equal(SYSTEM_PROMPT.includes("nie wymyślaj cen"), true);
  assert.equal(SYSTEM_PROMPT.includes("wyłącznie wyników narzędzi"), true);
});

test("SYSTEM_PROMPT: dopytywanie o brakujące informacje", () => {
  assert.equal(SYSTEM_PROMPT.includes("dopytaj"), true);
});

test("SYSTEM_PROMPT: ceny w PLN, odpowiedzi po polsku", () => {
  assert.equal(SYSTEM_PROMPT.includes("PLN"), true);
  assert.equal(SYSTEM_PROMPT.includes("po polsku"), true);
});

test("SYSTEM_PROMPT: krótki lejek — jedna tura dopytania, karta od razu, czysty tekst", () => {
  assert.equal(SYSTEM_PROMPT.includes("JEDNYM zwięzłym pytaniem"), true);
  assert.equal(SYSTEM_PROMPT.includes("Nie czekaj, aż użytkownik poprosi o ofertę"), true);
  assert.equal(SYSTEM_PROMPT.includes("użytkownik JUŻ WIDZI"), true);
  assert.equal(SYSTEM_PROMPT.includes("zero markdownu"), true);
  assert.equal(SYSTEM_PROMPT.includes("KONKRETNE MIASTO"), true);
  assert.equal(SYSTEM_PROMPT.includes("nie dopytuj o coś, co użytkownik już podał"), true);
  assert.equal(SYSTEM_PROMPT.includes("gwiazdek"), true);
});

test("SYSTEM_PROMPT: klient niekonkretny — założenia zamiast ankiety, szukanie bez budżetu", () => {
  assert.equal(SYSTEM_PROMPT.includes("ZAKAZ ankiet"), true);
  assert.equal(SYSTEM_PROMPT.includes("BEZ budżetu"), true);
  assert.equal(SYSTEM_PROMPT.includes("TY prowadzisz"), true);
  // Pogoda/klimat NIE są „poza zakresem" — realny incydent: bot odmówił na
  // „gdzie jest teraz najcieplej w Europie?", czyli pytanie stricte podróżne.
  assert.equal(SYSTEM_PROMPT.includes("SĄ w zakresie"), true);
});

test("SYSTEM_PROMPT: zakaz fałszywej presji/sztucznej rzadkości", () => {
  assert.equal(SYSTEM_PROMPT.includes("nie używaj fałszywej presji"), true);
  assert.equal(SYSTEM_PROMPT.includes("ostatnie"), true);
});

test("SYSTEM_PROMPT: sprzedażowe domykanie — następny krok + alternatywy przy obiekcjach", () => {
  assert.equal(SYSTEM_PROMPT.includes("następnym krokiem"), true);
  assert.equal(SYSTEM_PROMPT.includes("zaproponuj alternatywę"), true);
  assert.equal(SYSTEM_PROMPT.includes("szukaj dalej"), true);
});

test("SYSTEM_PROMPT: konwersja bez zmyślania — obiekcja=nowa karta, fakty procesu zakupu", () => {
  // Bateria konwersyjna 2026-07-11: (a) przy „za drogo" Haiku powtarzał starą
  // kartę z przekłamanym zapasem zamiast wywołać narzędzie; (b) na pytanie
  // o płatność ZMYŚLIŁ przelew, „lata działalności" i „vouchery".
  assert.equal(SYSTEM_PROMPT.includes("W BIEŻĄCEJ turze"), true);
  assert.equal(SYSTEM_PROMPT.includes("Nie powtarzaj odrzuconej oferty"), true);
  assert.equal(SYSTEM_PROMPT.includes("all inclusive"), true);
  assert.equal(SYSTEM_PROMPT.includes("PROCES ZAKUPU"), true);
  assert.equal(SYSTEM_PROMPT.includes("NUITEE TRAVEL"), true);
  assert.equal(SYSTEM_PROMPT.includes("DWIE osobne"), true);
});

test("SYSTEM_PROMPT: koszt — długość promptu pod kontrolą (wysyłany z KAŻDYM requestem)", () => {
  // Limit 9000 (historycznie 6000→7000→8000→8500; +2026-07-24: 8500→9000, by
  // zmieścić guardraile uczciwości batch 1 (#6 pusty-budżet bez zmyślonej
  // kwoty, #8 brak danych o pogodzie live) BEZ cięcia dostrojonych fraz —
  // decyzja właściciela: prompt caching (cache_control w
  // orkiestratorze) zbija koszt statycznego prefiksu do 10% po pierwszym
  // wywołaniu, więc ~150 dodatkowych tokenów to ułamek grosza/rozmowę. Nadal
  // pilnujemy sufitu: pierwszy request płaci pełną stawkę.
  assert.equal(SYSTEM_PROMPT.length < 9000, true);
});

test("SYSTEM_PROMPT: guardraile uczciwości (batch 1) — brak zmyślonego progu, pogoda live", () => {
  // #6: pusty wynik NIE może wymuszać zmyślonej kwoty progu (payload nie zwraca X).
  assert.equal(SYSTEM_PROMPT.includes("NIE podawaj żadnej liczby"), true);
  // #8: aktualna pogoda/prognoza — bot mówi wprost, że nie ma danych na żywo.
  // (#2 „przykładowy termin" wycofany po baterii: dla konkretnego miasta daty
  //  użytkownika SĄ honorowane, więc disclaimer byłby nieuczciwy.)
  assert.equal(SYSTEM_PROMPT.includes("AKTUALNEJ pogodzie"), true);
});
