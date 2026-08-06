# 03 — Porównanie UX: HelpTravel vs Nuitee (white-label LiteAPI)

**Źródło:** zrzuty przekazane przez właściciela (desktop + mobile, obie strony)
+ lektura komponentów HelpTravel.

> Zastrzeżenie: strona referencyjna **nie została otwarta w przeglądarce**
> w tej sesji, więc opis interakcji Nuitee opiera się na zrzutach, nie na
> własnym teście. Interakcje (zachowanie mapy, debounce, loading states)
> pozostają do sprawdzenia — patrz `01-current-state-audit.md` §5.
>
> Nuitee to **benchmark funkcjonalny, nie wzór wizualny.** HelpTravel zostaje
> przy zieleni, swoim układzie i typografii. Kopiujemy *kompletność*, nie wygląd.

---

## 1. Wyniki wyszukiwania

| Element | Nuitee | HelpTravel dziś | Wniosek |
|---|---|---|---|
| Liczba wyników | „371 obiektów w Barcelona" | jest | bez zmian |
| Widok lista / mapa | przełącznik, mapa obok listy | **brak mapy** | Etap 7 (brama D1) |
| Markery z ceną i grupowaniem | tak („44 from zł507") | brak | Etap 7 |
| Ocena i liczba opinii | `8.4 Bardzo dobry · 1899 recenzji` | jest, podobnie | bez zmian |
| Gwiazdki | tak | jest | bez zmian |
| Dzielnica | „Barcelona, les Corts" | **brak** | Etap 5 |
| Odległość od centrum | „515 m z centre" | jest (heurystyka własna) | rozważyć `poi[]` |
| Cena | duża cena/noc + „1 noc, 1 pokój, w tym podatki i opłaty" | duża cena/noc, mały total | **hierarchia do odwrócenia** (Etap 3) |
| Przecena | „25% off" + przekreślenie | brak | **świadomie NIE dodajemy** — brak danych (D2) |
| Filtry szybkie (górny pasek) | tak (gwiazdki, anulacja, parking, basen…) | tylko sidebar | Etap 6 |
| Filtr marki / typu obiektu | tak | **brak** | odblokowane Etapem 1 (`chain`, `hotelTypeId`) |

**Uwaga o przecenach.** Nuitee pokazuje „25% off" — bo jako white-label
dostawcy renderuje `suggestedSellingPrice` (cena Booking.com) jako przekreśloną.
Pomiar: takie „off" byłoby na **100% ofert**, zawsze. To jest dokładnie ten
fałszywy sygnał, którego brief §4.4 zakazuje. **Ta różnica jest zamierzona
i nie należy jej „nadrabiać".**

---

## 2. Strona hotelu

| Element | Nuitee | HelpTravel dziś | Wniosek |
|---|---|---|---|
| Gwiazdki w nagłówku | tak | **nigdy się nie renderują** (błąd `starRating`) | Etap 1 — naprawa, nie nowa funkcja |
| Galeria: duże + siatka + „Pokaż wszystkie" | tak | częściowo | Etap 8 |
| Lightbox pełnoekranowy | tak | **[do potwierdzenia]** | Etap 8 |
| Zakładki (Przegląd/Udogodnienia/Pokoje/Recenzje/Opis) | tak, sticky | **brak** | Etap 8 |
| Kategorie ocen z paskami | tak (Czystość 9.3, Obsługa 9.8…) | brak | Etap 10 — dane są (`sentiment_analysis.categories`) |
| „Najważniejsze informacje z recenzji" | tak, tagi | brak | Etap 10 (`sentiment.pros`) |
| Pojedyncze opinie | autor, typ, data, ocena, treść | `hotel-reviews.tsx` ma **42 linie** | Etap 10 |
| „Kto tu zostaje?" (para/solo/rodzina) | tak, % | brak | **warunkowo** — `review.type` bywa `"NONE"`; najpierw pomiar |
| „Inteligentne wyróżnienia" | tak, oznaczone jako AI | brak | Etap 11, z adnotacją (R11) |
| Sticky pasek z ceną + CTA | tak | jest, ale **pod czatem** (`z-30` vs `z-40`) | Etap 4 + 12 |
| Mapa i „Pokaż na mapie" | tak | brak | Etap 7 |

---

## 3. Pokoje — największa różnica

| Element | Nuitee | HelpTravel dziś |
|---|---|---|
| Zdjęcie konkretnego pokoju | **tak**, karuzela „1/11" | **brak — ani jednego** |
| Metraż | „30 m²" | brak |
| Miejsca do spania | „Miejsca do spania 3" | tylko „Maks. gości" |
| Rodzaj łóżka | tak | brak |
| Udogodnienia pokoju | tak (ekspres, prysznic…) | brak |
| Warianty cenowe | „Tylko pokój" / „Pokój ze śniadaniem" | **jest, dobrze zrobione** (`group-rates.ts`) |
| Anulacja z terminem | tak | **jest** |
| Podatki przy wariancie | „+144 zł podatki i opłaty" | **jest, ale etykieta nieprawdziwa** dla ~52% taryf |
| Szczegóły pokoju (modal) | tak | brak |

Grupowanie taryf (`group-rates.ts`) jest **mocniejsze niż u Nuitee** — Nuitee
pokazuje ścianę powtarzalnych kart, HelpTravel składa je w jedną kartę na pokój.
**Tego nie ruszamy**, dokładamy tylko warstwę wizualną: zdjęcia i metryki pokoju.

---

## 4. Mobile

| Problem | Nuitee | HelpTravel dziś |
|---|---|---|
| Panel filtrów | pełnoekranowy | sidebar + `z-40` (**równo z czatem**) |
| Mapa pełnoekranowa | tak, z „Przeszukaj ten obszar" | brak |
| Sticky CTA vs czat | brak kolizji | **kolizja** (`z-30` pod `z-40`) |
| Bezpieczny obszar (safe-area) | — | do sprawdzenia w Etapie 12 |

---

## 5. Czego u Nuitee **nie kopiujemy**

1. **Przecen i „% off"** — brak uczciwej podstawy (D2).
2. **Niebieskiej kolorystyki** — HelpTravel ma własną markę (zieleń).
3. **„Zaloguj się"** — nie ma kont użytkowników.
4. **Przycisku „Zapisz"/ulubione** — jeśli nic nie zapisuje, brief §11.1
   zakazuje udawania działania. Do rozstrzygnięcia przy `save-hotel-button.tsx`.
5. **Automatycznego tłumaczenia opinii** — zmienia znaczenie (brief §13).
