# Audyt historii cen hotelu

Raport wynika wyłącznie z `src/lib/hotels/price-history.ts` i jego użycia w `src/app/hotele/[hotelId]/page.tsx`.

## Klucz Redis i kontekst wyszukiwania

Dokładny format klucza to:

```text
phist:v1:<hotelId>:<checkin>:<checkout>:<adults>-<children>-<rooms>:<currency>
```

`children` oznacza wiek dzieci posortowany rosnąco i połączony kropkami. Dla braku dzieci środkowy fragment jest pusty, np. `phist:v1:lp1:2026-09-15:2026-09-17:2--1:PLN`.

Klucz obejmuje walutę i wszystkie wskazane parametry: `checkin`, `checkout`, `adults`, `children`, `rooms`, `currency`. Kolejność dzieci nie zmienia klucza. Nie obejmuje natomiast pokoju, taryfy, wyżywienia ani warunków anulacji.

## TTL i możliwy wzrost

TTL wynosi `35 * 24 * 3600`, czyli **3 024 000 sekund (35 dni)**. Jeden klucz jest hashem, a jego pola mają format dnia UTC `YYYY-MM-DD`; dla jednego dokładnego klucza powstaje najwyżej jedno pole na dobę. W ciągu 30 dni może więc dojść do 30 nowych pól dla jednej kombinacji parametrów.

Dla całego hotelu kod nie ustanawia skończonego limitu. Przy `N` różnych kombinacjach dat, obłożenia i waluty może powstać `N` hashy i do `30 × N` nowych pól w 30 dni. Dodatkowo TTL dotyczy całego hasha i jest odnawiany po zapisie nowego minimum. Pola starsze niż 30 dni są pomijane przy odczycie, ale nie są usuwane, więc regularnie zapisywany hash może rosnąć dłużej niż 35 dni, po jednym polu na każdą kolejną dobę. Cały hash wygaśnie dopiero po 35 dniach bez zapisu odnawiającego TTL.

## Tożsamość porównywanej oferty

Cena nie pochodzi zawsze z tej samej kombinacji pokoju, taryfy, wyżywienia i anulacji. Strona wybiera `pickCheapestRate(roomTypes)`, czyli najtańszą w danym renderze taryfę ze wszystkich pokojów, a historia zapisuje wyłącznie jej kwotę pod kluczem kontekstu wyszukiwania. Przy następnym odczycie najtańsza może być inna taryfa, inny pokój, inne wyżywienie albo inne zasady anulacji.

Powstaje ryzyko porównywania „jabłek z gruszkami”: historyczne minimum może dotyczyć np. pokoju bez wyżywienia i bez zwrotu, a cena bieżąca pokoju ze śniadaniem i bezpłatnym anulowaniem. Minimalna poprawka to dodać do klucza stabilny identyfikator wariantu i zapisywać oraz odczytywać historię dla aktualnie wybranego wariantu. Fingerprint powinien uwzględniać co najmniej `mappedRoomId`, taryfę/`rateId`, `boardType` lub `boardName` oraz `cancellationPolicies` (`refundableTag` i istotne warunki z `cancelPolicyInfos`); kod nie daje podstaw, by uznać samo `rateId` za stabilne przez 30 dni.

## Wpływ błędu Redis na render

Błędy komend `hget`, `hset`, `expire` i `hgetall` są przechwytywane: zapis kończy się bez wyjątku, a odczyt zwraca `null`. Brak zmiennych środowiskowych również jest bezpieczny, bo `getRedis()` zwraca `null`.

Nie jest jednak prawdą, że każdy błąd Redis na pewno nie wywali renderu. `getRedis()` jest wywoływane przed blokiem `try`; inicjalizacja `new Redis(...)` może rzucić np. dla nieprawidłowego, niepustego URL. `lowestPrice30d(...)` jest na stronie oczekiwane przez `await`, więc taki wyjątek przerwie render. Przy `void recordPrice(...)` ten sam przypadek tworzy nieobsłużone odrzucenie Promise. Pełna izolacja wymagałaby objęcia `getRedis()` tym samym `try`, ale logika nie została zmieniona w ramach tego zadania.
