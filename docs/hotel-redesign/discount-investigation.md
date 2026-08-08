# Przeceny — śledztwo (brief §15 i §28)

**Data:** 2026-08-08 · **Metoda:** surowy `POST /hotels/rates` na kluczu produkcyjnym, bez warstw pośrednich
**Wynik:** uczciwe przeceny ISTNIEJĄ i zostały wdrożone. **Poprzedni audyt był błędny.**

---

## 1. Korekta poprzedniego ustalenia

`09-final-report.md` (sesja z 2026-08-06) zapisał:

> Przecen nie ma i nie może być. Pomiar 400 taryf: `initialPrice === total` na **400/400**.

To była **pomyłka wynikająca z rozmiaru próby**, nie właściwość dostawcy. 400 taryf to
ułamek jednego miasta, a zjawisko dotyczy ~2,5% taryf — przy takiej próbie łatwo
trafić same zera i uznać, że zera są regułą.

Powtórzony pomiar, pięć miast, **33 421 taryf**:

| Miasto | Hoteli | Taryf | `initialPrice > total` |
|---|---:|---:|---:|
| Málaga | 35 | 6 210 | **168** |
| Hurghada | 40 | 6 290 | **281** |
| Rzym | 40 | 6 726 | **89** |
| Paryż | 37 | 6 774 | **131** |
| Warszawa | 39 | 7 421 | **183** |
| **razem** | **191** | **33 421** | **852** |

Przeceny wystąpiły we **wszystkich pięciu miastach**, w **70 z 191 hoteli**.
Dostawca każdej z nich: `nuitee`. Typ ceny: `commission`.

Rozkład procentów (852 przypadki):

```
 3% ×175    4% ×457    5% ×112    6% ×76    24% ×24    26% ×8
```

min 2,6% · mediana 4,1% · maks 26,4%

Przykład z żywego API (Málaga, `lp657cb01d`, Hampton by Hilton):
`860 → 829 PLN`, ta sama taryfa „King Room", to samo śniadanie, ta sama polityka
anulacji (`RFN`), ta sama waluta.

---

## 2. Które pole jest uczciwą ceną odniesienia

Surowa taryfa ma **trzy** pola cenowe. Nie są wymienne.

```jsonc
"retailRate": {
  "total":                   [{ "amount": 730.83, "currency": "PLN" }],
  "initialPrice":            [{ "amount": 730.83, "currency": "PLN" }],
  "suggestedSellingPrice":   [{ "amount": 749.78, "currency": "PLN",
                                "source": "booking.com" }]
}
```

### `initialPrice` — UŻYWAMY

Cena wyjściowa **tej samej taryfy u tego samego dostawcy**. Porównanie
`initialPrice` z `total` spełnia każdy warunek z briefu §15A automatycznie,
bo to dwa pola **jednego obiektu**: ten sam pokój, ten sam pobyt, to samo
obłożenie, ta sama waluta, to samo wyżywienie, ta sama anulacja, to samo
traktowanie podatków.

### `suggestedSellingPrice` — NIE UŻYWAMY

- wyższe od naszej ceny w **6 210 / 6 210** taryf (Málaga) — czyli **100%**
- `source`: `booking.com` w 5 926 przypadkach, pusty w 284

To cena **konkurenta**, nie nasza cena historyczna. Przekreślenie jej
oznaczałoby przecenę na **każdej ofercie w serwisie, zawsze** — czyli stały
sygnał promocji, który nigdy nie znika. Brief §15A zabrania tego wprost
(„Nie wymyślaj original price"), a §4.4 nazywa to fałszywym sygnałem.

Dla porządku: rozkład „rabatu" liczonego z `suggestedSellingPrice` to
min 0,2% / mediana 7,4% / maks 19,2%. Wygląda wiarygodnie i **właśnie dlatego**
jest groźny — bez `source` w danych nikt by nie zauważył, że to cudzy cennik.
Pole `competitorReference` zachowuje `source` celowo: to jedyny dowód w danych,
czym ta liczba jest.

### `promotions` i `perks` — puste

`promotions ≠ null` w 32 z 33 421 taryf (Paryż 8, Warszawa 24), `perks` puste
we wszystkich. Zbyt rzadkie i nierozpoznane, żeby na tym budować UI.

### Renditiony / warianty — nie istnieją

Sprawdzone przy okazji: `hotelImages[].urlHd === url` w 100% wpisów (4 hotele,
298 zdjęć). Dostawca nie ma wariantu HD.

---

## 3. Co zostało wdrożone

`src/lib/hotels/domain/price.ts`:

```ts
const MIN_DISCOUNT_PERCENT = 3;

export function honestDiscountFrom(rate: LiteApiRate):
  { originalMinor: bigint; percent: number } | null
```

- źródłem jest **wyłącznie** `retailRate.initialPrice`,
- próg 3% odcina zaokrąglenia z okolic zera (rozkład i tak zaczyna się na 2,6%),
- brak obniżki → `null` → UI **nie rysuje niczego**.

Droga danych:

```
/hotels/rates  →  honestDiscountFrom()  →  SlimRate.originalAmount  (cache Redis, KEY_VERSION v4)
                                        →  PriceBreakdown.discount  (strona hotelu)
```

`KEY_VERSION` v3 → **v4**: wpisy v3 nie mają `originalAmount`, więc bez podbicia
przeceny pojawiałyby się losowo, hotel po hotelu, w miarę wygasania TTL.

Miejsca w UI:
- **karta wyniku** (`result-card.tsx`) — plakietka `−X%` + przekreślona cena w szynie cenowej,
- **wiersz taryfy** (`rooms-section.tsx`) — to samo przy każdym wariancie pokoju.

Testy (`domain.test.ts`, 8 przypadków): odtworzenie przykładu z briefu
(1787 → 1387 = −22%), zmierzona taryfa 860 → 829 = −4%, odcięcie progu na 2%,
przejście progu na 3%, cena równa i wyższa → `null`, oraz **zabezpieczenie przed
regresją**: taryfa z `suggestedSellingPrice` wyższym od ceny NIE tworzy przeceny,
ale zachowuje `competitorReference.source`.

---

## 4. Otwarta kwestia dla właściciela — prawo, nie technika

Dyrektywa Omnibus (w Polsce egzekwowana przez UOKiK) wymaga, by przy
**ogłoszeniu obniżki ceny** podać **najniższą cenę z 30 dni** przed obniżką.
Przekreślona cena z plakietką procentową jest takim ogłoszeniem.

`initialPrice` to cena wyjściowa taryfy u dostawcy, a **nie** najniższa cena
z 30 dni w naszym serwisie — takiej historii dziś nie prowadzimy.

Trzy drogi, decyzja jest biznesowo-prawna:

1. **Zostawić jak jest.** Przecena pochodzi z realnej obniżki tej samej taryfy;
   ryzyko istnieje, ale sygnał nie jest fałszywy.
2. **Zbudować historię 30 dni.** Mamy Upstash i cron `warm-rates` co 30 min —
   technicznie wykonalne: dopisywać minimum ceny per `(hotel, daty, obłożenie)`.
   Koszt: nowy klucz w Redisie i przemyślenie retencji.
3. **Zrezygnować z plakietki**, zostawić samą niższą cenę bez przekreślenia.

Do czasu decyzji obowiązuje wariant 1 — zgodnie z briefem §15, który tego
wprost żąda.

---

## 5. Jak powtórzyć pomiar

Skrypty sondujące (poza repo, w katalogu roboczym sesji) robiły dokładnie to:

```
POST https://api.liteapi.travel/v3.0/hotels/rates
{ hotelIds: […40 z /data/hotels], checkin, checkout,
  occupancies: [{adults:2}], currency: "PLN", guestNationality: "PL" }
```

i zliczały `retailRate.initialPrice[0].amount > retailRate.total[0].amount`.

**Wniosek metodyczny na przyszłość:** przy zjawiskach rzędu pojedynczych
procent próba 400 rekordów nie wystarcza, żeby orzec „nie istnieje". Ta pomyłka
kosztowała jedną iterację i kazała napisać w raporcie zdanie, które było
nieprawdziwe.
