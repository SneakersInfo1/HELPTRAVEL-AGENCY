# HANDOFF — misja SEO V4 (stan na 13.11.2026, sesja 1 przerwana limitem użycia)

Gałąź: `claude/helptravel-seo-modernizacja-6f1b7c` (worktree `.claude/worktrees/helptravel-seo-modernizacja-6f1b7c`).
Nic nie zostało wypchnięte ani opublikowane. Produkcja nietknięta.

Wznowienie: `Wznów misję z docs/seo/HANDOFF.md, bez pytań. Realizuj następne etapy.`

## Co jest zrobione i zacommitowane

| Commit | Zakres | Dowód |
|---|---|---|
| `6d2ba2f` | Crawler technicznego SEO (`pnpm seo:crawl`), audyt HTML, importer GSC (parser, segmenty, marka, okresy, ranking szans) | `pnpm test:seo` 39/39; liczby z misji potwierdzone testem na prawdziwym CSV |
| `58b91c3` | 301 dla `/porównanie/*` i `/porunanie/*` (realne 404 z GSC), tylko 1:1 na istniejącą parę | testy `legacy-redirects`, `middleware` 15/15 |
| `9ec54a2` | Polskie znaki w 12 artykułach, 22 przewodnikach i opisach porównań (334 wiersze) | `pnpm test` 1663/1663 |
| ten commit | Skrypt zrzutów (`pnpm seo:shots`), kontrakt treści (`src/lib/content-engine/schema.ts`), bramka jakości (`src/lib/content-quality/gate.ts`) — **bramka BEZ testów** | tsc i eslint czyste |

Bazowe wyniki repo przed zmianami: `pnpm test` 1659/1659, `tsc --noEmit` 0 błędów, `eslint` 0 błędów. Builda nie uruchamiałem.

## Co jest w toku (NIEZWERYFIKOWANE)

- **Codex (`gpt-5.6-sol`, max) buduje pipeline silnika treści** w `src/lib/content-engine/*` (hash, store, llm, budget, retry, ledger, sources, inventory, pipeline, fixtures), `scripts/content-engine/run.ts`, `content/seo/`, `.github/workflows/seo-content-daily.yml`. Prompt: scratchpad `codex-content-engine.md` (kopia specyfikacji w sekcji „Spec pipeline'u" niżej nie jest potrzebna — kontraktem są `schema.ts` i `gate.ts`). W chwili przerwania istniały pliki modułów bez testów. **Tych plików nie czytałem i nie testowałem — przed commitem: przeczytać, uruchomić `node --import tsx --test "src/lib/content-engine/**/*.test.ts"`, `tsc`, `eslint`.** W `models.ts` ceny modeli są celowo zawyżonymi zaślepkami `TODO_VERIFY`.
- Lokalny `.env.local` w worktree zawiera tylko `PEXELS_API_KEY` i `NEXT_PUBLIC_SITE_URL` (bez LiteAPI/Upstash — lokalny build nie obciąża dostawców).

## Ustalenia audytu (crawl produkcji 13.11.2026, 2484 pobrań, 0 błędów; dane w `seo-private/`, poza gitem)

- Stan techniczny dobry: sitemap 1401/1401 → 200, `lang=pl` wszędzie, canonical na siebie, 0 błędów JSON-LD, 0 zepsutych linków wewnętrznych, 1 tytuł i 1 H1 na stronę.
- **Porównania (54):** tytuły 63–71 znaków (ucinane), opisy 157–180 znaków, H1 ogólnikowe („Porównanie pod realną decyzję wyjazdową"), `og:description` niegramatyczne, `twitter:title` = domyślny tytuł serwisu, okruszki prowadzą do `/kierunki` zamiast `/porownanie`, blok „Inne porównania" identyczny na każdej stronie (pierwsze 12 par). CTR 1,2–3,6% na poz. 4–6.
- **Strony miesięcy:** 605 z 1039 indeksowanych ma < 150 słów w `<main>` (mediana 146); 819 bez FAQ. Indeks jest zamrożony — masowy noindex wymaga decyzji właściciela (plan KEEP 145 / MERGE 416 / NOINDEX 478 z Fazy 2.1).
- **Brak `og:image` na 54 stronach** (huby `/wyjazdy/*`, `/hotele/w/*`, `/porownanie`, strony informacyjne): strona z własnym `openGraph` gubi obraz z layoutu.
- JSON-LD `ItemList` hubów `/wyjazdy/*` wskazuje `/hotele/szukaj?...` (Disallow) dla kierunków bez przewodnika.
- `/loty/wyniki` nie jest w `robots.txt` Disallow, a huby linkują tam `<a>` — ryzyko wywołań dostawcy przez roboty renderujące JS (do rejestru ryzyk, bez zmiany).
- Istniejące treści wysokiego ryzyka bez źródła: artykuł „Ciepłe kraje bez wizy", kategoria „Bez wizy".
- GSC 11.08–10.11: marka ≥ 830 z 1166 kliknięć; strony miesięcy 692 URL / 17 555 wyśw. / 66 klik.; porównania 52 / 9432 / 178; `/wyjazdy/city-break` 2506 wyśw. na poz. 17,8.

## Dowody ze źródeł zebrane do treści 4 porównań (pobrane 13.11.2026 ok. 18:30–18:45 UTC, cytaty dosłowne)

| Źródło | Cytat |
|---|---|
| whc.unesco.org/en/list/404 | „form the greatest architectural and artistic complex bequeathed by Greek Antiquity to the world"; „Date of Inscription: 1987" |
| whc.unesco.org/en/list/91 | „includes some of the major monuments of antiquity such as the Forums, the Mausoleum of Augustus, the Mausoleum of Hadrian, the Pantheon"; „Date of Inscription: 1980" |
| whc.unesco.org/en/list/934 | „It is the largest surviving area of laurel forest and is believed to be 90% primary forest"; „Date of Inscription: 1999" |
| whc.unesco.org/en/list/1258 | „at 3,718 m, is the highest peak on Spanish soil"; „Date of Inscription: 2007" |
| whc.unesco.org/en/list/782 | „Built between 1482 and 1533"; „It is a masterpiece of late Gothic architecture"; „Date of Inscription: 1996" |
| whc.unesco.org/en/list/320 | „Seven properties built by the architect Antoni Gaudí (1852–1926) in or near Barcelona"; „Date of Inscription: 1984" |
| spain.info/en/destination/malaga/ | „Beyond its 16 sunny beaches"; „the birthplace of Pablo Picasso"; „one of the largest Arab fortresses in Andalusia"; „the only Pompidou Centre outside France" |
| spain.info/en/destination/valencia/ | „a charming old town next to futuristic buildings"; „The Malvarrosa beach is one of the most well-known options"; „take a walk along the huge Turia city garden"; „it's 19 March, when they celebrate the famous Fallas" |
| spain.info/en/destination/barcelona/ | „Overlooking the Mediterranean Sea, and famous for Gaudí and other Art Nouveau architecture" |
| spain.info/en/region/tenerife-island/ | „The Teide is Spain’s highest mountain, and you can go to the top of it in a cable car"; „Las Teresitas is one of the most famous beaches" |
| visitgreece.gr/mainland/attica/athens/ | „is the largest airport in Greece and the country’s main international gateway" |
| visitgreece.gr/mainland/attica/ | „The southern coastline, known as the Athens Riviera, stretches from Faliro to Sounio"; „Piraeus , Greece's largest port" |
| italia.it/en/lazio/rome | „home to two capitals in one city: the Italian capital and the home of the Pope in the Vatican" |
| visitmadeira.com/en/what-to-do/nature-seekers/activities/hiking/ | „All classified walking trails (PR) in Madeira require a reservation" (dane DYNAMIC → `REVIEW_REQUIRED`) |

Przed użyciem każdy cytat trzeba ponownie sprawdzić mechanicznie względem pobranej strony (kopie HTML były w katalogu tymczasowym sesji i mogą nie istnieć).

## Następne kroki w kolejności

1. Zweryfikować i zacommitować wynik Codeksa; dodać testy bramki jakości (≥ 12 przypadków, pomiar fałszywych alarmów) i podpiąć `test:seo` do `pnpm test`.
2. `src/lib/seo/social-meta.ts`: wspólny `openGraph` + `twitter` + obraz domyślny; zastosować w porównaniach, miesiącach, hubach, `/hotele/w`.
3. Porównania: krótsze tytuły/opisy/H1, okruszki przez `/porownanie`, powiązane porównania po wspólnym kierunku, przepisać `intent` (część nadal bez znaków: „wloskie", „Cieplo", „Srodziemne", „rowne", „wschodzaca").
4. Dokumenty treści `content/seo/comparisons/*.json` dla 4 priorytetowych par (dowody wyżej) + loader po stronie stron.
5. Redesign: 3 kierunki art direction na trasie laboratoryjnej (flaga env, noindex), zrzuty 390/768/1440, wybór, wdrożenie w 3 szablonach; zrzuty „przed" są w `seo-private/screenshots/before/`.
6. Etapy 5–7: scenariusze dry-run, GA4 (`page_type`, `content_id`, `topic_cluster`), Lighthouse, axe, smoke po buildzie, `/code-review`.
7. Dokumenty: `TOOLING_AUDIT`, `BASELINE`, `INVENTORY.csv`, `OPPORTUNITY_BACKLOG.csv`, `RISK_REGISTER`, `EDITORIAL_POLICY`, `AUTOMATION_RUNBOOK`, `DESIGN_/EDITORIAL_QUALITY_STANDARD`, `OWNER_ACTIONS`, `RESULTS`, skille `helptravel-design-identity` i `helptravel-editorial-quality`.

## Narzędzia — stan faktyczny

| Narzędzie | Stan |
|---|---|
| Frontend Design (`frontend-design@claude-plugins-official`) | zainstalowany w zakresie projektu **tylko w tym worktree** (`.claude/` jest w `.gitignore`); skill przeczytany, nieużyty jeszcze do projektu |
| Context7, Codex, GitHub, Superpowers | były zainstalowane; Context7 nietestowany zapytaniem |
| Skill Creator, Code Review | dostępne jako wbudowane skille; nieużyte |
| Playwright + Chromium | działa (zrzuty z produkcji wykonane) |
| UI UX Pro Max, 21st.dev, Chrome DevTools MCP, SiteOne, Lighthouse CI, axe | **niezainstalowane / niesprawdzone** — 21st.dev wymaga klucza (`BLOCKED_AUTH`), SiteOne zastąpiony własnym crawlerem |
| GSC API, GA4 | brak dostępu — praca na CSV; GA4 `NOT_CONNECTED` |
| MCP `codex-worker` | nie połączył się; użyty `codex exec` z CLI |
