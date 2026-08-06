# Punkt odniesienia — 2026-08-06 (przed przebudową)

Gałąź `feat/hotel-experience-redesign`, stan identyczny z `main @ 82f9fd6`
(audyt nie zmienił kodu aplikacji).

## Jak zmierzono

```bash
pnpm build                 # WAŻNE: przy ZATRZYMANYM pnpm dev, inaczej build pada
pnpm start                 # serwer produkcyjny na :3000
pnpm lighthouse            # własny Chrome, niezależny od panelu przeglądarki
```

Lighthouse mierzy build **produkcyjny** — pomiary z `pnpm dev` są bezwartościowe
jako punkt odniesienia (kod nieskompresowany, brak optymalizacji).

Do `scripts/run-lighthouse.ts` dodano trasę **strony konkretnego hotelu** —
do 2026-08 nie była mierzona w ogóle, mimo że to końcówka lejka zakupowego.

## Wyniki

| trasa | perf | a11y | bp | seo | FCP | **LCP** | CLS | TBT |
|---|---|---|---|---|---|---|---|---|
| `/` (homepage) | **43** | 100 | 100 | 100 | 1936 | **7816** | 0 | **1644** |
| `/hotele/szukaj` Madrid | 83 | 96 | 100 | **69** | 1202 | 4348 | 0 | 162 |
| `/hotele/szukaj` Lisbon | 79 | 96 | 100 | **69** | 1219 | 4476 | 0 | 273 |
| `/hotele/szukaj` Bilbao | 85 | 96 | 100 | **69** | 1085 | 4189 | 0 | 104 |
| `/hotele/lp6558036a` | 82 | 100 | 0* | 92 | 1082 | 4101 | 0 | 115 |

Pełne raporty JSON: `tmp/lighthouse/2026-08-06T16-00-26-690Z-*.json`
(katalog `tmp/` jest poza repozytorium — przy potrzebie powtórzyć pomiar).

## Interpretacja — trzy rzeczy, które łatwo źle odczytać

### (*) `bp = 0` na stronie hotelu to **artefakt raportowania, nie defekt**

Prawdziwy wynik kategorii to `null`: audyt `charset` zakończył się błędem, więc
Lighthouse nie policzył kategorii. Helper `score()` w `scripts/run-lighthouse.ts`
robi `Math.round((value ?? 0) * 100)` → `null` staje się `0`.

Wszystkie audyty „best practices", które faktycznie się wykonały, mają wynik 1
(HTTPS, brak przestarzałych API, brak błędów w konsoli, cookies third-party OK).

> **Do poprawy w skrypcie:** `null` powinien być raportowany jako `n/a`, nie `0`.
> Inaczej następna sesja będzie ścigać nieistniejący problem.

### `seo = 69` na wynikach wyszukiwania to **prawdziwa sprzeczność**

Audyt `is-crawlable` wskazuje **linię 6 pliku `robots.txt`**:

```
Disallow: /hotele/szukaj
```

Jednocześnie `generateMetadata` w `src/app/hotele/szukaj/page.tsx:97` wysyła dla
stron z kierunkiem:

```html
<meta name="robots" content="index, follow"/>
```

Strona mówi Google „indeksuj mnie", a `robots.txt` zabrania jej crawlować.
**Do rozstrzygnięcia z właścicielem** — czy strony wyników mają być w indeksie.
To decyzja SEO (patrz `SEO_MASTER_PLAN.md` w `../helptravel-docs-prywatne/`),
nie techniczna, i wykracza poza przebudowę UI.

Osobno: lokalny `robots.txt` pokazuje `Host: https://example.com` i
`Sitemap: https://example.com/sitemap.xml` — **sprawdzić na produkcji**, czy to
tylko efekt braku zmiennej środowiskowej lokalnie, czy realny wyciek zaślepki.

### `meta-description = 0` na stronie hotelu — **niepotwierdzone**

Lighthouse zgłasza brak, ale `curl` na tej samej trasie zwraca:

```html
<meta name="description" content="Zarezerwuj Vincci Larios Diez w Málaga. Ceny finalne w PLN…"/>
```

Jeden pomiar sprzeczny z bezpośrednim sprawdzeniem HTML. **Nie traktować jako
faktu** — powtórzyć pomiar przed jakąkolwiek „naprawą".

## Czego w tym punkcie odniesienia BRAKUJE

- **Zrzutów ekranu.** Panel przeglądarki nie kompletuje klatek („the Browser
  pane is not displayed"), więc `computer{action:"screenshot"}` kończy się
  timeoutem. To ustawienie po stronie aplikacji, nie problem kodu.
  Do zrobienia, gdy panel będzie widoczny — brief §26.6 wymaga porównania
  „przed i po".
- Pomiarów mobilnych (Lighthouse leciał w profilu domyślnym skryptu).
- Czasu otwarcia galerii / szczegółów pokoju (te elementy jeszcze nie istnieją).

## Uwaga o zmienności

Trasy `/hotele/*` odpytują **prawdziwe LiteAPI**, więc LCP zależy od odpowiedzi
dostawcy (podłoga `/hotels/rates` to ~3,3 s — patrz pamięć projektu). Porównując
„po", mierzyć kilkukrotnie i patrzeć na medianę, nie na pojedynczy przebieg.
