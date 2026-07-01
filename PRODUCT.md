# Product

## Register

product

## Users

Polski turysta wypoczynkowy (plaża, city break, słońce zimą). Szuka po polsku,
porównuje ceny na telefonie, często nie wie jeszcze DOKĄD jechać. Jest nieufny
wobec nowych serwisów — zanim poda kartę, sprawdza, kto za tym stoi.
Job to be done: „znajdź i zarezerwuj lot + hotel bez kombinowania, w PLN,
bez zakładania konta".

## Product Purpose

HelpTravel — polski serwis rezerwacji podróży: hotele + loty w jednym miejscu.
Rezerwacje realizuje LiteAPI, płatności przetwarza Stripe (karta/BLIK/Google
Pay), potwierdzenie od razu na e-mail. Sukces = użycie wyszukiwarki i domknięta
rezerwacja; homepage i podstrony istnieją po to, by najkrótszą drogą doprowadzić
do wyszukiwarki (search-first, jak Booking). Niezdecydowanych prowadzą chipy
nastrojów → /wyjazdy/[typ].

## Brand Personality

Konkretny, uczciwy, ciepły. Ton polskiego doradcy, nie korporacyjnego portalu.
Emocje docelowe: pewność („wiem, ile zapłacę"), spokój („nic mnie nie zaskoczy"),
apetyt na wyjazd (zdjęcia + realne ceny, nie krzyk).

## Anti-references

- Agregatory-krzykacze: migające countdowny, „ostatnie 2 pokoje!", fałszywa
  presja — nigdy.
- Zmyślone liczby: „50 000 klientów", gwiazdki bez źródła, ceny z sufitu.
  Historia projektu: fikcyjne „od X zł" liczone z hasha zostały USUNIĘTE
  2026-06-11; każda liczba na stronie musi pochodzić z realnych danych
  (snapshot cen z crona, prawdziwy profil Trustpilot).
- Ściana tekstu SEO nad wyszukiwarką; homepage nie może być długi.

## Design Principles

1. **Search-first** — każda sekcja albo jest wyszukiwarką, albo do niej
   prowadzi; nic nie konkuruje z głównym CTA.
2. **Uczciwość ponad kompletność** — brak danych = brak liczby; lepszy kafelek
   bez ceny niż cena zmyślona.
3. **Zaufanie przez fakty weryfikowalne** — Trustpilot (prawdziwy profil),
   Stripe, LiteAPI, ceny finalne w PLN; zero ogólników „sprawdzeni partnerzy".
4. **Krótko i gęsto** — mniej sekcji o większej wartości; dublujące się ścieżki
   (chipy vs karty kolekcji) łączymy, nie mnożymy.
5. **Nie ruszaj dopracowanego** — formularz wyszukiwarki (MiniPlannerForm/
   HomeSearchTabs) ma za sobą tygodnie tuningu i eventy GA4; zmiany tylko
   w otoczce.

## Accessibility & Inclusion

- Kontrast tekstu ≥ 4.5:1 (body) / ≥ 3:1 (duży tekst) — także na zdjęciach
  (gradient pod tekstem).
- Nawigacja klawiaturą w comboboxach/kalendarzu już działa — nie regresować.
- Gotcha techniczny: globalne `a { color: inherit }` bije klasy `text-*` na
  `<a>` — kolor etykiety linku-przycisku zawsze na wewnętrznym `<span>`.
- Język: polski, proste zdania; daty i ceny w polskich formatach.
