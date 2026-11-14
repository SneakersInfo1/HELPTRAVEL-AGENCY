# Polityka redakcyjna treści SEO

Wersja polityki: `2026-11-13.1` (`POLICY_VERSION` w `src/lib/content-engine/schema.ts`). Zmiana zasad wymaga podniesienia wersji, bo każdy raport bramki ją zapisuje.

## 1. Zasada nadrzędna

Fakt trafia na stronę tylko wtedy, gdy ma źródło i dosłowny cytat, który da się sprawdzić mechanicznie. Wolimy zdanie krótsze albo jego brak niż zdanie prawdopodobne. Ocena „co wybrać” jest opinią redakcji i tak jest podpisana. Nie udajemy relacji z podróży.

## 2. Źródła

Dozwolone są wyłącznie hosty z listy `SOURCE_ALLOWLIST` (`src/lib/content-engine/sources.ts`):

| Rodzaj | Hosty |
|---|---|
| Oficjalne portale turystyczne miast i regionów | `visitmadeira.com`, `webtenerife.com`, `visitvalencia.com`, `malaga.eu`, `visitcostadelsol.com`, `barcelonaturisme.com`, `thisisathens.org`, `turismoroma.it` |
| Oficjalne portale krajowe | `spain.info`, `visitportugal.com`, `visitgreece.gr`, `italia.it` |
| Dziedzictwo | `whc.unesco.org` |
| Urzędy i przepisy | `gov.pl` |
| Lotniska | `aena.es` |
| Klimat | `ipma.pt`, `aemet.es`, `wmo.int` |

Zasady korzystania:

- Dodanie hosta to zmiana w kodzie i przechodzi przegląd. Wikipedia, blogi, fora i serwisy rezerwacyjne nie są źródłami.
- Hosty dostawców (`liteapi`, `nuitee`, `stripe`, `duffel`) są zablokowane na sztywno. Robot treści nie wywołuje też tras wyszukiwania, rezerwacji i lotów naszego serwisu.
- Pobieramy tylko po HTTPS, z limitem 2 MB i ręczną obsługą przekierowań. Każde przekierowanie musi prowadzić do dozwolonego hosta.
- **Nie obchodzimy zabezpieczeń.** Jeżeli źródło odpowiada blokadą dla automatów, przebieg oznacza fakt jako niesprawdzony. `spain.info` i `whc.unesco.org` blokują dziś zapytania automatyczne. Cztery dokumenty z tej gałęzi zweryfikowano na migawkach pobranych zwykłym zapytaniem 13.11.2026, a każda migawka ma zapisany skrót SHA-256 w dokumencie.
- **Szanujemy zastrzeżenia wydawców.** UNESCO deklaruje w `robots.txt` użycie wyłącznie referencyjne. Dlatego wpisy UNESCO mają `aiInput: false`: ich treść nie trafia do modelu, a służy tylko do sprawdzenia przygotowanego ręcznie twierdzenia („Date of Inscription: RRRR”).
- Cytujemy krótko, z nazwą wydawcy i linkiem. Nie kopiujemy opisów ze źródeł.

## 3. Klasy danych, ryzyko i termin ważności

| Klasa danych | Ryzyko | Ważność twierdzenia |
|---|---|---|
| geografia | `EVERGREEN` | 1825 dni |
| atrakcja (np. wpis UNESCO) | `EVERGREEN` | 365 dni |
| norma klimatyczna | `EVERGREEN` | 1825 dni |
| transport | `DYNAMIC` | 180 dni |
| godziny otwarcia | `DYNAMIC` | 90 dni |
| własny inwentarz (np. cena z naszego pomiaru) | `DYNAMIC` | 7 dni |
| cena | `DYNAMIC` | 2 dni |
| warunki wjazdu | `HIGH_RISK` | 30 dni |

Dokument dziedziczy najwyższe ryzyko swoich twierdzeń.

- `EVERGREEN` może być publikowany automatycznie wyłącznie w trybie `AUTO_EVERGREEN`, którego domyślnie nie włączamy.
- `DYNAMIC` zawsze wymaga człowieka.
- `HIGH_RISK` zawsze wymaga człowieka i źródła urzędowego, także wtedy, gdy automat uzna tekst za poprawny. Dotyczy to wiz i dokumentów, bezpieczeństwa i komunikatów MSZ, zdrowia i szczepień, ubezpieczeń i praw pasażera.

Po terminie ważności twierdzenie przestaje być faktem. `pnpm content:freshness` kończy się błędem, a strona pokazuje wersję bez dokumentu, dopóki ktoś nie zweryfikuje źródła ponownie.

## 4. Ceny

Nie podajemy cen z pamięci, z cudzych serwisów ani „orientacyjnych”. Kwota może pochodzić wyłącznie z własnego pomiaru z datą (migawki cen w serwisie). Nie używamy słowa „okazja” ani porównań do „ceny regularnej”, bo nie mamy ceny z 30 dni wymaganej przez przepisy. Nie obiecujemy dostępności.

## 5. Czego nie piszemy

- Zmyślonych doświadczeń („byliśmy”, „nasz redaktor spędził tydzień”), opinii turystów i ocen bez źródła.
- Fałszywej presji („ostatnie miejsca”, „tylko dziś”).
- Superlatywów bez miary i fraz-wypełniaczy.
- Lat w tekście stałym („w 2026 roku”), jeśli nie są częścią faktu ze źródła.

## 6. Autorstwo i ujawnienie AI

- Autorem i redaktorem odpowiedzialnym jest osoba podpisana na stronie (dziś założyciel serwisu). Pole `owner` dokumentu wskazuje redakcję, a `reviewedBy` osobę, która zatwierdziła tekst.
- Każda strona z dokumentem treści pokazuje pod źródłami informację: „Tekst przygotowany z pomocą AI na podstawie wskazanych źródeł. Każdy cytowany fakt został sprawdzony mechanicznie w treści źródła; ocena «co wybrać» jest opinią redakcji, nie relacją z podróży.”
- Pokazujemy też datę sprawdzenia źródeł (`verifiedAt`).

## 7. Daty

- `dateModified` w danych strukturalnych i `lastmod` w mapie witryny pochodzą wyłącznie z `materiallyModifiedAt` dokumentu. Zmienia się tylko przy zmianie merytorycznej, a pilnuje tego skrót treści (`contentHash`) i reguła `date_modified_without_change`.
- Strony bez dokumentu treści nie mają `lastmod`. Nie podajemy daty, której nie umiemy uzasadnić.

## 8. Zdjęcia

Zdjęcia pochodzą z Pexels (licencja Pexels) z podpisem autora albo z puli zdjęć w repozytorium. Nie używamy obrazów generowanych jako zdjęć miejsc. Każde zdjęcie w dokumencie ma opis alternatywny.

## 9. Linki i CTA

- CTA prowadzi do istniejącej trasy wyszukiwania z kierunkiem. Nigdy do kroku zakupu.
- Linki zewnętrzne do źródeł mają `rel="noopener nofollow"`.
- Nowy artykuł ma co najmniej 3 linki wewnętrzne do istniejących stron i nie może zająć adresu ani tytułu istniejącej strony.

## 10. Korekty i wycofanie

- Błąd merytoryczny poprawiamy w dokumencie. Podnosimy wtedy `version` i `materiallyModifiedAt`, a zmianę opisujemy w commicie.
- Jeżeli fakt przestał być prawdziwy i nie ma nowego źródła, usuwamy zdanie albo cały dokument. Strona wraca wtedy do wersji generowanej z danych bazowych.
- Wycofanie całego mechanizmu: usunięcie plików z `content/seo/` (strony działają dalej bez wzbogacenia) albo revert PR.

## 11. Publikacja

1. Silnik albo człowiek tworzy dokument ze statusem `in_review`.
2. Bramka jakości i weryfikacja źródeł muszą dać wynik `PASS` albo `REVIEW_REQUIRED` bez zastrzeżeń blokujących.
3. Człowiek czyta tekst i zatwierdza go poleceniem `content:verify --approve`.
4. Zmiana trafia na `main` przez PR. Nie ma automatycznego wypychania na `main`.

Szczegóły automatyzacji opisuje `AUTOMATION_RUNBOOK.md`.
