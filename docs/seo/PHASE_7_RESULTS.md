# Etap 7 — testy i przegląd kodu: wyniki

## Testy

| Rodzaj | Polecenie | Wynik |
|---|---|---|
| Jednostkowe i integracyjne całego projektu | `pnpm test` | 1672 zaliczone |
| SEO, bramka treści, silnik, klient GSC | `pnpm test:seo` | 186 zaliczonych |
| Kontrola dokumentów treści | `pnpm content:check` | 4/4, wszystkie `approved` |
| Typy i linter | `pnpm exec tsc --noEmit`, `pnpm lint` | czyste |
| Test dymny po buildzie lokalnym | `pnpm seo:smoke` | 263/263 |
| Test dymny na Preview (Vercel) | `pnpm seo:smoke -- --base <preview> --share <token>` | 263/263 |
| Playwright z axe | `pnpm exec playwright test e2e/seo-templates.spec.ts` | 13/13 |
| Lighthouse (telefon, mediana z 3) | `pnpm lighthouse -- --routes=…` | dostępność 100, CLS 0, LCP bez regresji |
| Crawl buildu | `pnpm seo:crawl` | 0 błędów JSON-LD, 0 złych linków, 0 zmian robots |
| Kontrola treści w CI | workflow „SEO content check” na PR | zaliczona |
| Szablony w CI (build, test dymny, Playwright z axe) | zadanie `templates-e2e` na PR | zaliczone |

Test dymny i Playwright zostały powtórzone na końcowym buildzie, już po zmianie linków CTA opisanej niżej. Lighthouse i crawl pochodzą z buildu commita `b4d9a22`. Późniejsze zmiany dotyczą skryptów, klienta GSC, workflow, dokumentów i jednego atrybutu linku, więc nie zmieniają treści stron.

## Kontrola Preview

Preview na Vercelu używa prawdziwych kluczy dostawców, więc pokazuje to, czego nie widać lokalnie.

| Sprawdzenie | Wynik |
|---|---|
| Build | Pierwszy build padł po 20 s na pobieraniu fontów Google (`next/font`), poza kodem tej gałęzi. Ponowny build przeszedł. |
| Test dymny | 263/263 |
| Trzy szablony w 390, 768 i 1440 px | status 200, brak przepełnienia, 0 błędów konsoli, 0 żądań do API produktu przy wczytaniu |
| Pozycja pierwszego CTA na telefonie | 478, 388 i 645 px, tak samo jak lokalnie |
| Zdjęcia | prawdziwe zdjęcia miejsc z Pexels (Akropol, Rzym) |
| Blok statystyk hoteli | obecny na porównaniu Ateny–Rzym, zgodnie z założeniem nieobecny na parach spoza czołówki |

Zrzuty „po” w `docs/seo/screenshots/` pochodzą z tej kontroli.

### Znalezisko: prefetch wyszukiwarki przy każdej odsłonie

Kontrola sieci na Preview pokazała żądania RSC do `/hotele/szukaj?destination=…` wysyłane bez kliknięcia. Przyczyna: `next/link` pobiera wstępnie cel, gdy link wejdzie w pole widzenia, a nowe szablony przeniosły CTA do pierwszego ekranu. Na porównaniu dawało to 5 żądań na odsłonę, także od botów renderujących JavaScript.

Pomiar na buildzie produkcyjnym:

- Żądania **nie uruchamiały wyszukiwania u dostawcy**. Odpowiedź zawierała tylko drzewo trasy i metadane (około 4 kB), bez danych hoteli. Strona wyszukiwarki jest dynamiczna i jej komponent z zapytaniem do dostawcy nie był renderowany.
- Były jednak zbędnym ruchem na trasie produktu i niczego nie przyspieszały.

Poprawka: `SeoCtaLink` wyłącza prefetch dla tras transakcyjnych (`/hotele/szukaj`, `/hotele/rezerwacja`, `/loty`), a jawne ustawienie nadal wygrywa. Logika i testy: `src/lib/analytics/cta-prefetch.ts`.

| Strona | Żądania do `/hotele/szukaj` bez kliknięcia: przed → po |
|---|---|
| Porównanie Ateny–Rzym | 5 → 0 |
| Barcelona w styczniu | 3 → 0 |
| Przewodnik Barcelona | 0 → 0 |
| Hub city break | 2 → 2 |

Dwa żądania na hubie pochodzą z ogólnego linku do wyszukiwarki bez kierunku, który istniał wcześniej i nie przechodzi przez `SeoCtaLink`. Karty kierunków poniżej pierwszego ekranu też używają zwykłych linków. To wspólne komponenty serwisu, więc zostały bez zmian.

Kliknięcie CTA nadal prowadzi do wyszukiwarki z kierunkiem (Playwright 13/13).

Przy okazji naprawiono `seo:smoke --share`: token `_vercel_share` w każdym żądaniu dawał 27 fałszywych przekierowań 307. Skrypt wymienia teraz token na ciasteczko jeden raz. `seo:shots` dostał tę samą opcję.

## Przeglądy kodu

| Przegląd | Zakres | Ustalenia | Stan |
|---|---|---|---|
| Niezależny przegląd gałęzi | całość do `009db8e` | 15 | wszystkie naprawione w `e930cb4` |
| Wbudowany `/code-review` | `e930cb4..HEAD` | 9 | 6 naprawionych w `7b9636f`, 3 pominięte świadomie |
| Krytyczny przegląd Codeksa | cała gałąź | 14 (10 poważnych, 4 mniejsze, 0 krytycznych) | 12 naprawionych, 2 częściowo (patrz niżej) |

Naprawione po `/code-review`:

- Podpis JWT konta usługi używał czasu przebiegu zamiast bieżącego, więc powtórka starego dnia byłaby odrzucana.
- Raport tygodniowy zakładał dni w kolejności chronologicznej i uznawał okno za niepełne przy jednym dniu bez danych.
- Klient GSC pobierał pary strona × zapytanie, których nikt nie używał.
- Skrypt inwentarza gubił ostatni wiersz pliku bez końcowej nowej linii i dawał nieczytelne błędy przy braku plików.

Pominięte świadomie:

- Awaria API Search Console następuje przed startem potoku, więc nie tworzy wpisu w rejestrze błędów. Przyczyna jest widoczna w logu zadania.
- Limit czasu klienta GSC obejmuje oczekiwanie na odpowiedź, ale nie odczyt jej treści. Zadanie w CI ma własny limit 25 minut.
- Skrypt inwentarza ma własny parser CSV zamiast wspólnego.

## Krytyczny przegląd Codeksa

Przegląd w trybie tylko do odczytu, cała gałąź. Każde ustalenie zostało sprawdzone przed naprawą. Poprawki silnika wykonał Codex według specyfikacji, a ich kod i testy zostały przeczytane i uruchomione.

| # | Ustalenie | Stan |
|---|---|---|
| 1 | Dwa zatwierdzone teksty miały twierdzenia szersze niż zapisany cytat | Naprawione: cytaty rozszerzone i potwierdzone w migawkach. Nowa reguła dla identyfikatorów. |
| 2 | Automat mógł tworzyć treść, której żadna strona nie renderuje (404) | Naprawione: na żywo wybierane są tylko typy renderowane. |
| 3 | Wartość z dokumentu mogła zamknąć znacznik JSON-LD i wstrzyknąć skrypt | Naprawione: bezpieczny zapis w 17 miejscach, reguła odrzucająca HTML w treści. |
| 4 | Raport „publiczny” mógł ujawnić zapytanie GSC przez adres nowego tematu | Naprawione: raport budowany od zera z listy dozwolonych pól. |
| 5 | Kontrola offline nie egzekwowała listy dozwolonych źródeł | Naprawione. |
| 6 | Sekcja bez twierdzeń i twierdzenie niezweryfikowane omijały „wszystko albo nic” | Naprawione. |
| 7 | Porównanie liczb ignorowało jednostkę i mieszało zapisy | Naprawione. |
| 8 | Nieudany PR blokował temat na 14 dni | Naprawione: PR powstaje przed zapisem rejestru, a po błędzie temat jest zwalniany. |
| 9 | Limit kosztu nie obejmował tokenów wejściowych ani nieudanych prób | Naprawione: rezerwa obejmuje wejście i wyjście, błąd bez danych o zużyciu obciąża rezerwę. |
| 10 | Przebieg próbny blokował właściwy przebieg tego samego dnia | Naprawione: klucz idempotencji rozróżnia tryb, nieudany przebieg można ponowić. |
| 11 | Nieaktualny skrót treści przechodził kontrolę | Naprawione: kontrola kończy się błędem. |
| 12 | Pobieranie źródeł nie sprawdzało portu, danych logowania ani adresów prywatnych | Naprawione: odrzucane są dane logowania, porty inne niż 443 i adresy prywatne po rozwiązaniu DNS. |
| 13 | Workflow ma token z prawem zapisu, a `main` nie jest chronione | Częściowo: akcje przypięte do pełnych SHA. Ochrona gałęzi i rozdzielenie zadań wymagają właściciela (`OWNER_ACTIONS.md`, pkt 15). |
| 14 | Testy szablonów nie były wymagane w CI | Naprawione: zadanie `templates-e2e` (build, test dymny, Playwright) przeszło na tym PR. Oznaczenie go jako wymaganego to ustawienie repozytorium. |

Po poprawkach sprawdzono w wierszu poleceń: przebieg próbny, potem drugi próbny (`DUPLICATE_SKIPPED`), potem właściwy tego samego dnia (`DRAFT_CREATED`), ponowny właściwy (bez drugiego dokumentu) i zwolnienie tematu poleceniem `--release-pending`.

Ustalenie 13 jest prawdziwe: w chwili przeglądu gałąź `main` nie miała żadnej reguły ochrony.

## Czego testy nie pokrywają

- Prawdziwego modelu i prawdziwego API Search Console.
- Zachowania prawdziwych użytkowników i konwersji.
- Wpływu na pozycje i CTR. To pokaże dopiero GSC po 28 dniach.
