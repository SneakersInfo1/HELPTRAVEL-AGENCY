# Wdrożenie modernizacji SEO (11.2026): PR #154, #155, #157 i #158

Plan sprawdzony i wykonany 19.11.2026. #156 zostaje otwarty do akceptacji treści Barcelona–Malaga. Sekcje od „Stan wyjściowy” do 6 to procedura sprzed wdrożenia; pierwsza sekcja to jej wynik.

## Wynik wdrożenia (19.11.2026)

| PR | Merge commit na `main` | Czas (UTC) | Kontrola po wdrożeniu |
|---|---|---|---|
| #154 | `42998e3` | 18.11, 23:51 | CI zielone, produkcja READY, smoke 268/268, `robots.txt` i mapa witryny (1401 adresów) bez zmian, 0 błędów runtime |
| #155 | `e9e6b86` | 19.11, 07:59 | jak wyżej |
| #157 | `9d23295` | 19.11, 08:05 | jak wyżej, ale zdjęcia: incydent niżej |
| #158 | `2ee5430` | 19.11, 19:12 | jak wyżej, zdjęcia naprawione |

- **Przed pierwszym scaleniem:** obie stare Routines wyłączone, ruleset `main: tylko przez PR` aktywny (id `27595223`).
- **Sposób scalania:** wszystkie merge commitem, bez squasha i force-pusha.
- **#156:** przestawiony na `main` i zaktualizowany, ale nie scalony.

**Incydent zdjęć po #157.** Seria buildów (Preview i produkcja w ciągu kilku godzin) wyczerpała limit Pexels w trakcie builda. Strona główna, katalog, przewodniki i huby dostały wtedy zdjęcia zastępcze z `commercial-assets.ts`, część z innych miast (Barcelona = wieża Eiffla). Porównania zostały bez zdjęć, bo mają regułę „prawdziwe albo żadne”.

- **Doraźnie (09:16 UTC, po odnowieniu limitu):** unieważniłem tag `pexels-media` bez builda, według procedury z `RUNBOOK.md`.
  - Ręcznie sprawdziłem 6 stron: stronę główną, `/kierunki`, dwa przewodniki i dwa huby.
  - Jedyny błąd: karta „Rodos” pokazywała Stare Miasto na Korfu. Tak zwróciła je wyszukiwarka Pexels.
- **Trwale: #158.**
  - Rejestr zweryfikowanych zdjęć dla 45 kierunków.
  - Wyszukiwanie tylko na produkcji, z kontrolą opisu (musi podać miasto i kraj).
  - Układ bez zdjęcia zamiast zdjęć zastępczych.
- **Wynik po #158:**

  | Strona | Zdjęcia | Puste miejsca |
  |---|---|---|
  | strona główna | 24 | 0 |
  | `/kierunki` | 53 | 0 |
  | huby | po 6 | 0 |
  | porównania | po 8 | 0 |

  Nigdzie nie ma zdjęć z Unsplash.

## Stan wyjściowy

| PR | Gałąź → baza | Ostatni commit | Scalanie | CI |
|---|---|---|---|---|
| #154 | `claude/helptravel-seo-modernizacja-6f1b7c` → `main` | `e287175` | CLEAN | zielone |
| #155 | `claude/seo-daily-workflow` → #154 | `94f5273` | CLEAN | zielone |
| #157 | `claude/porownania-redesign` → #154 | `94ede75` | CLEAN | zielone |
| #156 | `claude/seo-daily/2026-11-17` → #155 | `abff906` | UNSTABLE | content-check czerwony z założenia (dokument `in_review`) |

**Przegląd Codex przed wdrożeniem (19.11):** werdykt NO-GO z powodu danych GSC w publicznym repo. Wszystkie jego uwagi sprawdziłem i potwierdziłem. Poprawki:
- `e287175` (#154):
  - backlog 20 adresów i oczekiwane liczby testów przeniesione do `seo-private/`;
  - testy parsera na danych syntetycznych, a wcześniej były tam surowe zapytania;
  - dokumenty i komentarze bez liczb;
  - `/data/gsc/` dopisany do `.gitignore`.
- `fe22d33` i `94f5273` (#155): `/seo-daily` czyta backlog spoza repo, a dane testowe są syntetyczne.

**Zostaje:** historia gita gałęzi #154 (dawne pliki i opis commitu `6d2ba2f`). To decyzja z sekcji 0.

- **Produkcja dziś:** wdrożenie `helptravel-agency-lvxvgxbve-sneakersinfo1s-projects.vercel.app` (commit `06cf1aa`). To jest punkt cofnięcia.
- **Stan bazowy:** `robots.txt` ma 10 wierszy (sha256 `082697aefe948e1a…`), `sitemap.xml` ma 1401 adresów.
- **Gałąź integracyjna:** `preview/seo-release-2026-11` (`de62c2d`) = #154 + #155 + #157 scalone merge commitami; jej drzewo jest identyczne z wynikiem symulacji scaleń. Służy tylko do podglądu i nie wolno jej scalać. Wynik testów:
  - `tsc` i `lint` zielone, testy 1725/1725 i 261/261, bramka treści bez zmian;
  - Preview: test dymny 268/268, robots i mapa witryny identyczne z produkcją.
- **Symulacja scaleń (`git merge-tree`):**
  - merge commitami cały stos przechodzi bez konfliktów w obu kolejnościach, a wynik jest identyczny; #156 scalony później nie przywraca usuniętego backlogu;
  - squash bez przenoszenia gałęzi daje konflikty w 7 plikach #155 i w 9 plikach #157.

## 0. Decyzje właściciela przed startem

1. **Stare Routines:** wyłączyć dwie aktywne Routines z kwietnia, które mają polecenie squash-merge do `main`:
   - `trig_0189UHp9AwzwjJkeTrRzoMsf`: codziennie o 01:05 UTC; dziś kończy się „ZABLOKOWANE”, bo gałęzi nie ma;
   - `trig_01Tuv4eLGYjAowYsNUJMf9rQ`: 21.04.2027.
2. **Historia gita z dawnymi liczbami GSC** (bieżące pliki są już czyste). **Właściciel wybrał wariant A (19.11.2026).**
   - **A, zalecane:** merge commit, czyli procedura z sekcji 2. Historia #154 trafia do `main`. Te dane są już publiczne w gałęzi PR #154.
   - **B:** `main` bez tej historii. Wymaga to kolejno:
     - squasha #154 z własnym opisem commitu, bez domyślnej listy commitów, bo zawiera opis `6d2ba2f`;
     - przeniesienia #155 i #157 na nowy `main` przez `git rebase --onto origin/main e287175 <gałąź>` i wymuszonego pusha, przy możliwych konfliktach w `.gitignore`;
     - squasha każdego z nich z własnym opisem.

     Dane i tak zostają w refie PR #154 na GitHubie. Pełne usunięcie wymaga zgłoszenia do GitHub Support.
3. **Ochrona `main`:** włączyć ruleset z `docs/ops/main-ruleset.json`.
4. **Scalenie #154:** to zgoda na publikację czterech tekstów porównań i na zmianę H1 na 1592 stronach.

## 1. Przygotowanie

```powershell
git fetch origin
git merge-base --is-ancestor origin/main origin/claude/helptravel-seo-modernizacja-6f1b7c; $LASTEXITCODE   # 0 = #154 zawiera aktualny main
gh pr view 154 --json mergeStateStatus   # oczekiwane: CLEAN
```

Jeśli `main` się zmienił, wykonaj `gh api -X PUT repos/SneakersInfo1/HELPTRAVEL-AGENCY/pulls/154/update-branch` i poczekaj na zielone CI.

Ochrona `main` (po zgodzie, najlepiej przed krokiem A):

```powershell
gh api -X POST repos/SneakersInfo1/HELPTRAVEL-AGENCY/rulesets --input docs/ops/main-ruleset.json
gh api repos/SneakersInfo1/HELPTRAVEL-AGENCY/rulesets
```

Co robi ruleset:
- `main` zmienia się tylko przez PR (0 wymaganych akceptacji, bo jest jeden właściciel);
- blokuje force-push i usunięcie gałęzi;
- dopuszcza scalanie przez merge commit i squash.

Czego celowo w nim nie ma:
- **Wymaganych testów:** `seo-content-check.yml` uruchamia się tylko dla wybranych ścieżek, więc wymagane kontrole zablokowałyby każdy PR spoza SEO.
- **Wymogu liniowej historii:** zablokowałby merge commity.

Jeśli API odrzuci pole `allowed_merge_methods`, usuń je z pliku i powtórz polecenie.

## 2. Scalanie: tylko merge commit, nigdy squash

**A. #154**

```powershell
gh pr merge 154 --merge
```

Poczekaj, aż wdrożenie produkcyjne w Vercelu będzie READY (około 2 min), i zrób szybką kontrolę (punkty 1–4 z sekcji 3).

**B. Bazy dzieci na `main`** (od razu po A, bo gałęzie nie kasują się same)

```powershell
gh pr edit 155 --base main
gh pr edit 157 --base main
```

**C. #155**

```powershell
gh api -X PUT repos/SneakersInfo1/HELPTRAVEL-AGENCY/pulls/155/update-branch
gh pr checks 155 --watch
gh pr merge 155 --merge
```

`update-branch` scala `main` do gałęzi PR zwykłym commitem, bez force-push, i ponownie uruchamia content-check, templates-e2e oraz Vercela.

**D. #157**

```powershell
gh api -X PUT repos/SneakersInfo1/HELPTRAVEL-AGENCY/pulls/157/update-branch
gh pr checks 157 --watch
gh pr merge 157 --merge
```

Potem pełna kontrola z sekcji 3.

**E. #156 bez scalania**

```powershell
gh pr edit 156 --base main
gh api -X PUT repos/SneakersInfo1/HELPTRAVEL-AGENCY/pulls/156/update-branch
```

PR zostaje otwarty. Scalenie dopiero po akceptacji tekstu: `pnpm content:verify -- --approve barcelona-spain-vs-malaga-spain --by "Imię Nazwisko" --write`, potem commit i zielone CI.

## 3. Kontrola produkcyjna

**Po każdym scaleniu (szybka):**

1. Vercel → Deployments → Production: READY, a commit to właściwy merge. `https://helptravel.pl/` odpowiada 200.
2. `pnpm seo:smoke -- --base https://helptravel.pl` daje 268/268.
3. `robots.txt` jest identyczny jak w stanie bazowym, a `sitemap.xml` ma 1401 adresów.
4. Vercel → Observability → Errors: przez 30 min brak nowych błędów 5xx.

**Po kroku D (pełna):**

5. Zrzuty z PowerShella:

   ```powershell
   pnpm seo:shots -- --base https://helptravel.pl --label prod --out <folder poza repo> --paths "/porownanie/athens-greece-vs-rome-italy,/porownanie/barcelona-spain-vs-valencia-spain,/porownanie/malaga-spain-vs-valencia-spain,/porownanie/funchal-portugal-vs-santa-cruz-de-tenerife-spain,/"
   ```

   Oczekiwane: brak przewijania w poziomie, 0 błędów konsoli, CTA nad zgięciem. Strona główna ma wyglądać jak przed wdrożeniem.
6. Telefon, pierwsza wizyta:
   - pojawia się kompaktowy baner;
   - „Tylko niezbędne” zamyka baner i nie ładuje GA4;
   - „Akceptuję wszystkie” daje `page_view` w GA4 Realtime.
7. CTA:
   - „Hotele: X” prowadzi do `/hotele/szukaj` z kierunkiem;
   - link do lotów otwiera zakładkę lotów z wpisanym celem;
   - kliknięcie wysyła `seo_cta_click`.
8. Zdjęcia (stan po #158):
   - kierunki ze strony głównej, hubów, porównań i stron „Hotele w …” mają zdjęcia z rejestru `src/lib/media/verified-photos.ts`;
   - pozostałe biorą zdjęcia z wyszukiwania Pexels tylko wtedy, gdy opis zdjęcia podaje miasto i kraj. Mimo to sprawdź, czy pokazują właściwe miejsca;
   - brak zdjęcia, gdy nic nie przejdzie kontroli albo Pexels nie odpowie, jest zamierzony.
9. Vercel → Cron Jobs: warm-rates, warm-flights, warm-featured-hotels, warm-flight-deals i build-concierge-snapshot działają bez błędów.
10. Przez 7–14 dni:
    - GSC: indeksowanie, zasięg, CTR porównań; dla czterech artykułów można zgłosić ponowne indeksowanie;
    - GA4: `seo_cta_click`.

## 4. Cofnięcie

**Natychmiast, bez builda (około 1 min):**
- Vercel → Deployments → Production → `helptravel-agency-lvxvgxbve-…` (`06cf1aa`) → *Instant Rollback* albo *Promote to Production*.
- Tylko #158 (zdjęcia): to samo dla `helptravel-agency-4q6pszvrj-…` (`9d23295`, stan po #157). Wraca wtedy wyszukiwanie zdjęć bez kontroli miejsca.
- Uwaga: po Instant Rollback kolejne pushe do `main` nie trafiają na produkcję, dopóki ręcznie nie wypromujesz wdrożenia.

**Kodem, przez PR na `main`:**
- **Cały pakiet:** `git revert -m 1 <merge #158>` (`2ee5430`), potem #157, #155 i #154, czyli w odwrotnej kolejności. Ponowne scalenie wycofanego PR wymaga „revert of revert”.
- **Tylko układ „Magazyn”:** zmiana jednej linii `DEFAULT_COMPARISON_VARIANT = "werdykt"` w `src/components/editorial/comparison-template.tsx`.
- **Jeden artykuł:** usunąć jego plik z `content/seo/comparisons/`. Strona wraca wtedy do wersji bez tekstu.
- **Baner cookies:** revert pliku `src/components/site/cookie-consent-banner.tsx`.

Pakiet nie zawiera migracji bazy, zmian Redisa, cronów, `vercel.json` ani zmiennych środowiskowych, więc cofnięcie kodu jest pełne.

## 5. /seo-daily po wdrożeniu

- **Brak harmonogramów:** po #155 `seo-content-daily.yml` ma tylko `workflow_dispatch`, bez `schedule` i sekretów, z uprawnieniem `contents: read`. Żaden workflow w repo nie ma harmonogramu.
- **Okno między #154 a #155:** stoi tam wersja z #154 z cronem 04:17 UTC, ale jest bezczynna. Zadanie wymaga zmiennej `SEO_ENGINE_SCHEDULE_ENABLED=true`, której w repo nie ma, a tryb na żywo sekretu `SEO_ENGINE_ANTHROPIC_API_KEY`, którego też nie ma. Jedyny sekret Actions to `CRON_SECRET`. Zalecane jest scalić #155 tuż po #154.
- **Płatne API tylko świadomie:** `content:run` na żywo wymaga klucza i jawnej flagi `--allow-paid-api`. `seo:daily` przerywa pracę, gdy w środowisku jest klucz silnika. Pilnują tego testy `no-paid-api.test.ts`.
- **Blokady dla sesji Claude:** `.claude/settings.json` blokuje push do `main`, force-push oraz `curl` do API modeli.
- **Routines:** stary automat SEO `trig_014tGuLtDeg7J72zuJq95X2H` jest wyłączony.
- **Po scaleniu #155** skill `/seo-daily` sam przełączy bazę na `main`.

## 6. Znane ograniczenia (nie blokują)

- **Baner na laptopach:** przy 1366×768 przy pierwszej wizycie zasłania dolną połowę pary CTA, a przy 1024×768 pierwszy przycisk. Znika po jednym kliknięciu. Prawy róg zajmuje dymek czatu.
- **Zdjęcia spoza rejestru** (przewodniki mniej popularnych kierunków) zależą od limitu Pexels. Wyniki leżą w cache 30 dni. Gdy limit się wyczerpie albo żadne zdjęcie nie przejdzie kontroli opisu, strona pokazuje układ bez zdjęcia, a nie cudze zdjęcie.
- **Karta „Teneryfa (Teide)”** w hubie „góry” ma zdjęcie Auditorio w Santa Cruz. To właściwa wyspa, ale nie wulkan. Karty „Tanie loty” na stronie głównej są poza rejestrem; sekcja jest ukryta, dopóki nie ma świeżych cen lotów.
- **Funchal–Teneryfa:** klasa DYNAMIC; godziny otwarcia wygasają 11.02.2027 (`pnpm content:freshness`).
- **Backlog dla `/seo-daily`:** leży tylko lokalnie w `seo-private/OPPORTUNITY_BACKLOG.csv`. Sesja na innym komputerze bez tego pliku potrzebuje świeżego eksportu GSC, co i tak jest pierwszym krokiem procedury. Bez eksportu narzędzie pokaże czytelny komunikat.
- **#156 przy późniejszym scaleniu** nie przywróci usuniętych danych, co sprawdziłem symulacją. Jego gałąź trzeba jednak zaktualizować z `main` (krok E).
- **Wariant `noindex`** dla 158 stron zostaje nieaktywny. To osobna decyzja.
