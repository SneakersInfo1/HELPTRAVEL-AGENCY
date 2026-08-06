# 05 — Plan testów

## 0. Reguła nadrzędna

Brief §4.5: **nie deklarujemy, że coś działa, jeśli nie zostało uruchomione.**
Każdy wpis w `06-progress-log.md` o przejściu testu musi mieć komendę i wynik.

---

## 1. Pułapka: nowy plik testu **sam z siebie się nie uruchomi**

`package.json` → `"test"` to **jawna lista plików**. Nowy `*.test.ts` jest
niewidoczny dla `pnpm test`, dopóki nie zostanie tam dopisany. To najczęstsze
źródło fałszywego poczucia pokrycia w tym repo (ryzyko R-09).

Kontrola: liczba plików w wyjściu `pnpm test` musi wzrosnąć po dodaniu testu.

## 2. Pułapka: `import "server-only"` psuje `node:test`

Moduły dotykające ziarna kierunków albo produkcyjnych zależności nie dają się
zaimportować w teście. Ustalony wzorzec to **wstrzykiwanie zależności**: czysta
logika przyjmuje wejście/wyjście jako argumenty (`concierge/tool-deps.ts`
podpięte tylko w route), a testy podają atrapy. Moduły Redisowe mają szew
`__set*ForTests`.

**Nowe moduły domenowe (Etap 2) muszą trzymać się tego wzorca** — inaczej nie da
się ich przetestować.

---

## 3. Testy statyczne (każdy etap)

```bash
pnpm lint
npx tsc --noEmit
pnpm test
pnpm build
```

## 4. Testy jednostkowe — co musi być pokryte

### Ceny i podatki (Etap 3) — **priorytet, tu jest dziś błąd**
- wszystkie pozycje `included: true` → „w tym podatki i opłaty"
- jakakolwiek `included: false` → „+ X zł płatnych na miejscu"
- **mieszanka** `true` + `false` w jednej taryfie
- brak `taxesAndFees` → **żadnej wzmianki o podatkach**
- opis opłaty jako tekst w obcej walucie (`"$163.02 USD per room per stay"`) → nie sumujemy
- total ≠ suma nocy × cena/noc (nie mnożymy, bierzemy `total` od dostawcy)
- `initialPrice == total` → **zero przeceny** (dziś: 400/400 przypadków)

### Model domenowy (Etap 2)
- brak zdjęć / ocen / recenzji / współrzędnych / opisu
- `rooms: null` (hotele „sparse")
- `cancelPolicyInfos: []` przy `refundableTag: "NRFN"` → „bezzwrotna", nie „brak danych"
- `refundableTag` czytany z **zagnieżdżonego** `cancellationPolicies`
- dopasowanie taryfa↔pokój: trafienie, brak trafienia, trafienie niejednoznaczne

### Udogodnienia (Etap 11)
- `facilityId 47` + `107` → **jedno** wyjście („Bezpłatne Wi-Fi")
- nieznany `facilityId` → nie ginie, trafia do „Pozostałe"
- wejście angielskie i polskie dają ten sam wynik

### Formatowanie (Etap 4)
- `1 noc / 2 noce / 5 nocy`, `1 gość / 2 gości`, `1 pokój / 2 pokoje / 5 pokoi`
- waluta w `pl-PL`

### Schematy (Etap 1)
- `starRating` obecne, `stars` nieobecne → gwiazdki działają
- `checkinCheckoutTimes` w snake_case
- rekord z samymi `null` **nie wywraca** parsowania

## 5. Testy ręczne w przeglądarce (każdy etap UI)

Viewporty minimalne: **375**, 390, 768, 1280, 1440.
Pełna lista z briefu §26.4 — w Etapie 13.

Za każdym razem, po zmianie wspólnego kodu:
1. `/` — homepage bez zmian wizualnych (porównanie ze zrzutem z Etapu 0)
2. `/hotele/szukaj` — wyniki, filtry, ceny
3. `/hotele/[id]` — galeria, pokoje, sticky CTA vs czat
4. `/loty` — wyszukiwarka lotów działa
5. Czat otwiera się i nie zasłania CTA

## 6. E2E (Etap 13, brama D3)

18 scenariuszy z briefu §26.3. Bez decyzji o Playwright — **nie do zrobienia**;
w takim wypadku zapisujemy to jawnie jako niewykonane w raporcie końcowym,
zamiast udawać pokrycie.

## 7. Wydajność — przed i po

Mierzone w Etapie 0 i powtarzane w Etapie 12:
LCP, CLS, INP, liczba żądań, rozmiar JS, czas do pierwszych cen,
czas otwarcia galerii i mapy.

```bash
pnpm lighthouse
pnpm analyze     # rozmiar paczki
```

## 8. Testy, które **kosztują prawdziwe pieniądze**

Płatności i `book` ruszają realne środki. Wyłącznie klucz `sand_`.
`BOOKING_FLOW_MODE` zostaje `disabled`, dopóki właściciel nie zdecyduje inaczej.
