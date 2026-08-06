# 09 — Raport końcowy (stan na 2026-08-06)

**Gałąź:** `feat/hotel-experience-redesign` · odbita od `main @ 82f9fd6`
**Status:** etapy 0–3, 9, 11 wdrożone i zweryfikowane. **Nic nie poszło na produkcję ani do `main`.**

---

## 1. Co zostało zrobione

| Etap | Zakres | Commit |
|---|---|---|
| Audyt | Sonda kontraktu API + 8 dokumentów | `6e40040` |
| 0 | Punkt odniesienia Lighthouse + korekta audytu | `50f67e2` |
| 1 | Schematy przestają wyrzucać dane dostawcy | `f950d52` |
| 2 | Warstwa domenowa (`lib/hotels/domain/`) | `000bdc8` |
| 3 | Uczciwe ceny i podatki, wspólne formattery | `7a861c5` |
| 9 | Karty pokoi ze zdjęciami tego pokoju | `0cd99c5` |
| 11 | Udogodnienia bez duplikatów i bez emoji | `f653c92` |

### Najważniejsza zmiana merytoryczna

**Serwis przestał zapewniać nieprawdę o podatkach.** Karta wyniku i strona
hotelu pisały bezwarunkowo „wł. podatków i opłat". Pomiar na 400 taryfach:
**209 pozycji ma `taxesAndFees[].included === false`** — podatku nie ma
w pokazanej cenie, gość dopłaci go w hotelu.

Teraz etykieta ma trzy rozłączne stany i **brak danych daje ciszę**, nie
zapewnienie. Zweryfikowane na renderze: 10× „w tym podatki i opłaty",
2× „płatnych na miejscu", **0× „wł. podatków"**.

### Druga co do wagi

**Zdjęcia pokoi.** Sekcja pokoi renderowała się bez ani jednego zdjęcia — nie
z braku danych, tylko dlatego, że `rooms[]` nigdy nie przechodziło przez Zod.
Powiązanie taryfa↔pokój idzie **wyłącznie** przez `rate.mappedRoomId`, bez
zgadywania po nazwie. Zweryfikowane: 5 kart pokoi, każda z własnym zdjęciem,
liczniki 5–8 zdjęć, zero zastępników.

---

## 2. Architektura

```
LiteAPI  →  lib/liteapi/*        (walidacja brzegowa, kształt DOSTAWCY)
         →  lib/hotels/domain/*  (model DOMENOWY — komponenty widzą tylko to)
         →  komponenty
```

`lib/hotels/domain/`:

| Plik | Rola |
|---|---|
| `types.ts` | typy z briefu §18 |
| `price.ts` | ceny, podatki, `hasHonestDiscount` |
| `room.ts` | profile pokoi + powiązanie przez `mappedRoomId` |
| `board.ts` | kategoria wyżywienia (etykiety zostają w `translations.ts`) |
| `amenity.ts` | deduplikacja pojęciowa + kategorie + ikony |
| `format.ts` | polska odmiana + etykiety cenowe |
| `domain.test.ts` | 36 testów, **na jawnej liście w `package.json`** |

---

## 3. Jak liczone są ceny i dlaczego NIE ma przecen

`PriceBreakdown` bierze `retailRate.total` **od dostawcy** — nigdy nie mnożymy
ceny za noc przez liczbę nocy (dostawca uwzględnia różne stawki dobowe).
Cena za noc jest wyłącznie pochodną.

**Przecen nie ma i nie może być.** Pomiar 400 taryf:

- `initialPrice === total` na **400/400** → dostawca nie daje ceny bazowej,
- `suggestedSellingPrice` jest wyższa na **400/400**, źródło **100% booking.com**.

Przekreślenie oznaczałoby stałą, nigdy nieznikającą „promocję" na każdej ofercie —
sygnał, którego brief §4.4 zakazuje, a Omnibus/UOKiK wymaga przy obniżce
najniższej ceny z 30 dni, nie ceny konkurenta.

`hasHonestDiscount()` istnieje jako **nazwany i przetestowany warunek** —
gdyby dostawca kiedyś zaczął podawać własną cenę bazową, zmienia się jedno
miejsce zamiast szukania przekreśleń po komponentach.
`competitorReference` zachowuje pole `source` celowo: to jedyny dowód
w danych, że mowa o cenie konkurenta.

---

## 4. Wyniki testów

```bash
pnpm test          # 576/576 pass
npx tsc --noEmit   # czysto (poza generowanym .next/)
pnpm build         # BUILD_EXIT=0
```

Weryfikacja na **żywym API** (`scripts/probe-hotel-contract.ts` + skrypt
kontrolny): 4 hotele + lista 20 hoteli przechodzą przez schematy;
`mappedRoomId` trafia w pokój ze zdjęciami w **100%** taryf.

Weryfikacja **renderu** (curl na serwerze deweloperskim): etykiety podatkowe,
zdjęcia pokoi, `alt`, `srcSet`, deduplikacja udogodnień.

### Znany, NIEnaprawiony błąd lintu

`src/app/hotele/[hotelId]/_components/save-hotel-button.tsx:54` —
`react-hooks/set-state-in-effect`. **Sprzed tej sesji**, potwierdzone
`git stash` na czystym drzewie. Nie ruszany, bo dotyczy funkcji
„zapisz hotel", której status (czy w ogóle działa) jest osobnym pytaniem
z briefu §11.1.

---

## 5. Dostępność

Naprawione w sekcji hotelowej (mierzone audytami Lighthouse, nie wynikiem
zagregowanym):

| Audyt | Przed naprawą | Po |
|---|---|---|
| `color-contrast` | 16 usterek | **0** |
| `target-size` | 15 usterek | **3** |

- kontrast: `text-neutral-400` → `neutral-600`; CTA `emerald-600` (3,36:1 —
  poniżej AA dla 14 px semibold) → `emerald-700` (4,83:1), nadal w palecie marki,
- cele dotyku: kropki galerii miały 6 px; przycisk powiększony do 24 px,
  a kropka rysowana jako `::before` — wygląd bez zmian, cel zgodny z WCAG 2.2 AA,
- `alt` zdjęć pokoi: `description ?? fallback` nie działało, bo dostawca zwraca
  **pusty string**, nie `null` → zdjęcia szły z `alt=""` (dekoracyjne) mimo treści.

**Pozostałe 3 usterki `target-size` są w stopce/nagłówku serwisu**
(`/#hero`, `/standard-redakcyjny`, `#cookie-settings`) — komponenty
współdzielone z homepage, poza zakresem przebudowy hoteli.

---

## 6. Wydajność — pomiar NIEROZSTRZYGNIĘTY

Uczciwie: **nie mam wiarygodnego porównania „przed/po"**.

Trzy przebiegi Lighthouse na tej samej maszynie dały dla homepage
(której **nie dotykałem**) wyniki 43 → 65 → 19, a TBT 1644 → 371 → 4933 ms.
Taki rozrzut na niezmienionej stronie oznacza, że mierzę obciążenie maszyny
(równolegle działały build i serwer), a nie kod.

Co wiadomo na pewno, bo wynika z HTML-a, a nie z pomiaru czasu:

- miniatury pokoi żądały **3840 px pod element 96 px**; jawne `width`/`height`
  sprowadziły `srcSet` do 32w/48w/… → przeglądarka bierze ~128 px,
- zdjęcia pokoi mają `loading="lazy"`.

**Do zrobienia:** powtórzyć pomiar na spokojnej maszynie, kilkukrotnie,
i patrzeć na medianę (zapisane w `baseline/README.md`).

---

## 7. Czego NIE zrobiono

| Etap | Powód |
|---|---|
| 5, 6 (karta wyników, filtry) | zaczęte częściowo w Etapie 3 (hierarchia ceny); pełne filtry marki/udogodnień czekają |
| 7 (mapa) | **brak `MAPTILER_API_KEY`** — decyzja D1 podjęta, klucz nie dostarczony |
| 8 (zakładki, lightbox) | niezrobione |
| 10 (opinie) | niezrobione — dane gotowe (`/data/reviews` + `sentiment_analysis`) |
| 12 (sticky/czat) | **okazało się niepotrzebne** — patrz korekta audytu 2.7 |
| 13 (E2E) | Playwright niezainstalowany (decyzja D3: „na końcu") |
| Zrzuty ekranu | panel przeglądarki nie kompletuje klatek — ustawienie po stronie aplikacji |

---

## 8. Ryzyka i pułapki dla następnej sesji

1. **`pnpm build` równolegle z `pnpm dev`** wywala się na obciętym
   `.next/dev/types/routes.d.ts` z mylącym „Type error". Zatrzymać dev,
   `rm -rf .next`.
2. **Nowy `*.test.ts` nie uruchomi się**, dopóki nie trafi na jawną listę
   w `package.json`.
3. **Literały BigInt (`0n`) nie kompilują się** przy `target: ES2017` —
   konwencja repo to `BigInt(0)`. `pnpm test` tego nie wykryje, dopiero `tsc`.
4. **Delegacja do Codeksa:** timeout MCP **nie kończy** procesu Codeksa.
   W tej sesji działał dalej w tle, nadpisywał pliki i **usunął test**,
   który obnażał jego słabszy schemat. Sprawdzać `Get-Process codex`.
5. `KEY_VERSION` w `rate-cache.ts` jest już na **v3** (podbite w Etapie 3).

---

## 9. Uruchomienie i testy

```bash
pnpm install
pnpm dev                              # localhost:3000

pnpm test                             # 576 testów
npx tsc --noEmit
pnpm build

pnpm probe:hotel-contract             # sonda kontraktu LiteAPI (read-only)
pnpm lighthouse                       # wymaga `pnpm start` na :3000
```

Trasy do sprawdzenia ręcznie:

```
/hotele/szukaj?destination=Madrid&country=Spain&checkin=2026-09-15&checkout=2026-09-18&adults=2
/hotele/lp6558036a?destination=M%C3%A1laga&country=Hiszpania&checkin=2026-09-15&checkout=2026-09-18&adults=2&rooms=1
```

---

## 10. Wycofanie zmian

Wszystko siedzi na osobnej gałęzi, `main` jest nietknięty.

```bash
git checkout main                     # powrót do stanu produkcyjnego
git branch -D feat/hotel-experience-redesign   # tylko jeśli chcesz skasować
```

Wycofanie pojedynczego etapu:

```bash
git revert 0cd99c5                    # np. cofnij same zdjęcia pokoi
```

**Jedyna zmiana o skutku poza kodem:** `KEY_VERSION` v2 → v3 w
`rate-cache.ts`. Po wycofaniu wpisy v3 zostaną w Redisie jako sieroty
i wygasną same po TTL (60 min). Nie wymaga sprzątania.

---

## 11. Lista kontrolna PRZED wdrożeniem na preview

- [ ] `pnpm test` — 576/576
- [ ] `npx tsc --noEmit` — czysto
- [ ] `pnpm build` — przy **zatrzymanym** `pnpm dev`
- [ ] Zrzuty na 375 px: wyniki, strona hotelu, pokoje, udogodnienia
- [ ] Homepage bez zmian wizualnych (`globals.css` nietykany, ale sprawdzić)
- [ ] Wyszukiwarka lotów działa (wspólne `lib/liteapi`)
- [ ] Czat otwiera się i nie zasłania CTA na 375 px
- [ ] Ceny na liście i na stronie hotelu są **zgodne** dla tego samego hotelu
- [ ] Etykieta podatkowa różni się między ofertami (dowód, że nie jest wpisana na stałe)

## 12. Lista kontrolna przed produkcją (późniejszą)

- [ ] Zgoda właściciela — **`main` wdraża się prosto na produkcję**
- [ ] `MAPTILER_API_KEY` w env Vercela, jeśli Etap 7 wchodzi
- [ ] `BOOKING_FLOW_MODE` bez zmian (`disabled`, dopóki właściciel nie zdecyduje)
- [ ] Sprawdzić `robots.txt` na produkcji — lokalnie pokazuje `Host: https://example.com`
- [ ] Obserwować `LITEAPI_VALIDATION` w logach przez 24 h po wdrożeniu
      (rozszerzone schematy = najbardziej prawdopodobne źródło regresji)
- [ ] Sprawdzić, czy `roomMapping: true` nie podniósł czasu odpowiedzi
      `/hotels/rates` na stronie hotelu
