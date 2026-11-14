# Audyt narzędzi (Etap −1)

Stan na 14.11.2026. Każdy wiersz ze stanem `VERIFIED` ma za sobą prawdziwe wywołanie w tej misji, a nie sam wpis w konfiguracji.

## Środowisko

| Element | Wartość |
|---|---|
| System | Windows 11 Home, powłoki PowerShell 5.1 i Git Bash |
| Repozytorium | worktree `claude/helptravel-seo-modernizacja-6f1b7c`, baza `main` `06cf1aa` |
| Node / pnpm | 24.14.0 / 10.32.1 (lockfile `pnpm-lock.yaml`) |
| Python / Git | 3.14.10 / 2.53.0 |
| Claude Code | 2.1.116 (nie aktualizowany, zgodnie z poleceniem) |
| Stos | Next.js 16.2.9, React 19, TypeScript 5.9.3, Tailwind v4 |

## Narzędzia obowiązkowe

| tool | source | version | state | test evidence | risk | next action |
|---|---|---|---|---|---|---|
| Frontend Design | `frontend-design@claude-plugins-official` (zakres projektu) | katalog oficjalny, bez numeru | VERIFIED | Plugin włączony (`claude plugin list`). Treść skilla odczytana z pliku i zastosowana do trzech kierunków art direction oraz do skilla `helptravel-design-identity`. | Niskie. Pluginy ładują się przy starcie sesji, więc jako polecenie będzie widoczny dopiero w nowej sesji. | Brak. |
| UI UX Pro Max | marketplace `nextlevelbuilder/ui-ux-pro-max-skill`, plugin `ui-ux-pro-max@ui-ux-pro-max-skill` (zakres projektu) | 2.15.0 | VERIFIED | `search.py "table mobile" --domain ux` zwrócił 2 wytyczne. `search.py … --design-system -p HelpTravel` wygenerował specyfikację. Ocena specyfikacji jest w `DESIGN_QUALITY_STANDARD.md`: paleta, styl i fonty odrzucone, checklista dostępności przyjęta. | Kod społeczności. Przed uruchomieniem sprawdzone: manifest ma tylko skille, bez hooków i bez serwera MCP, a skrypty importują wyłącznie bibliotekę standardową (bez sieci). | Brak. |
| 21st.dev | marketplace `21st-dev/claude-code-plugin`, plugin `21st@21st` (zakres projektu) | 0.4.1 | BLOCKED_AUTH | Plugin zainstalowany, 7 skilli w pamięci podręcznej. Serwer MCP (`https://21st.dev/api/mcp`) wymaga nagłówka z `API_KEY_21ST`, a zmiennej nie ma w środowisku. Nie uruchomiono żadnej generacji. | Usługa z planem i limitami. Klucz może trafić tylko do zmiennej środowiskowej, nigdy do pliku w repo. | Właściciel: patrz `OWNER_ACTIONS.md`, pkt 9. Projekt powstał bez tego narzędzia. |
| Chrome DevTools | pakiet npm `chrome-devtools-mcp` (ChromeDevTools, Google), wpisany jako serwer MCP `chrome-devtools` w zakresie lokalnym | 1.13.0 | VERIFIED | Prawdziwa sesja JSON-RPC po stdio: `initialize`, `tools/list` (33 narzędzia), `new_page` na lokalnej stronie porównania, `resize_page` 390×844, `take_screenshot` (PNG 142 kB), `list_console_messages` i `get_console_message`. `claude mcp get chrome-devtools` pokazuje „Connected”. | Instalacja jako plugin nie powiodła się dwa razy (opis niżej), stąd rejestracja samego serwera. Wpis używa `@latest`. Profil przeglądarki jest izolowany i tymczasowy. | Opcjonalnie przypiąć wersję: `chrome-devtools-mcp@1.13.0`. Narzędzia MCP będą dostępne w nowej sesji. |
| Context7 | `context7@claude-plugins-official` (zakres użytkownika, istniał wcześniej) | katalog oficjalny, bez numeru | VERIFIED | Zapytanie `query-docs` do `/vercel/next.js` o łączenie `openGraph` w `generateMetadata`. Dokumentacja potwierdziła płytkie łączenie i znikanie odziedziczonego obrazu, czyli przyczynę 54 stron bez `og:image`. | Zapytania trafiają do zewnętrznego API, więc nie wolno w nich umieszczać danych prywatnych. | Brak. |
| Skill Creator | wbudowany `anthropic-skills:skill-creator` | wbudowany | VERIFIED | Dwa skille w `docs/seo/skills/` z 6 przypadkami testowymi (dobre i złe przykłady) oraz przebiegami „ze skillem / bez skilla”. Wyniki są w `EDITORIAL_QUALITY_STANDARD.md` i `DESIGN_QUALITY_STANDARD.md`. | Wersji z marketplace nie instalowano, żeby nie dublować wbudowanej. | Brak. Skille są już w `.claude/skills` projektu i ładują się w nowej sesji (`OWNER_ACTIONS.md`, pkt 10). |
| Code Review | wbudowany `/code-review` oraz niezależny przegląd całej gałęzi | wbudowany | VERIFIED | Przegląd gałęzi dał 15 ustaleń, wszystkie naprawione w `e930cb4`. Końcowy przegląd przed PR jest opisany w `PHASE_7_RESULTS.md`. | Przegląd automatyczny nie zastępuje decyzji właściciela o scaleniu. | Brak. |

### Dlaczego Chrome DevTools nie jest pluginem

1. `claude plugin marketplace add ChromeDevTools/chrome-devtools-mcp` zakończyło się błędem dostępu do repozytorium („correct access rights”).
2. Ponowienie przez adres HTTPS zaczęło klonować rekurencyjnie moduły zależne (m.in. `devtools-frontend` i źródła LLVM) i nie skończyło się w 5 minut. Zostawiło 648 MB w katalogu tymczasowym marketplace'ów, który został usunięty.
3. Zamiennik to ten sam serwer z oficjalnego pakietu npm, wpisany poleceniem `claude mcp add chrome-devtools --scope local -- npx -y chrome-devtools-mcp@latest --isolated --headless`. Funkcja jest ta sama (zrzuty, DOM, konsola, sieć, ślad wydajności, audyt Lighthouse). Brakuje tylko skilli dołączonych do pluginu.

Obserwacja z testu: konsola zgłasza jedną uwagę, „Lazy-loaded images should have explicit dimensions”, dla logo w `src/components/site/site-shell.tsx`. Ten komponent jest wspólny ze stroną główną i gałąź go nie zmienia. Zmierzony CLS na stronach treści wynosi 0, więc uwaga trafiła do `RISK_REGISTER.md` jako R-23, bez zmiany kodu.

## Narzędzia warunkowe

| tool | source | version | state | test evidence | risk | next action |
|---|---|---|---|---|---|---|
| Playwright Test + axe | `@playwright/test`, `@axe-core/playwright` (devDependencies) | 1.62.1 / 4.14.0 | VERIFIED | `e2e/seo-templates.spec.ts`: 13/13. Trzy szablony × trzy szerokości, fokus z klawiatury, kliknięcie CTA z przechwyconym `/hotele/szukaj`. axe wykrył kontrast 4,4:1 w podpisie autora, naprawiony. | Test CTA nie dotyka dostawcy, bo żądanie jest przechwycone. | Brak. |
| Playwright MCP | — | — | NOT_NEEDED | Tę rolę pełnią wbudowana przeglądarka aplikacji, Playwright Test i Chrome DevTools MCP. | — | Brak. |
| shadcn MCP | — | — | NOT_NEEDED | W repo nie ma `components.json`, a projekt nie używa shadcn. | Automatyczna przebudowa biblioteki UI byłaby poza zakresem. | Brak. |
| SiteOne Crawler | — | — | NOT_NEEDED | Własny crawler `pnpm seo:crawl`: produkcja 13.11, 2484 pobrane adresy, 0 błędów, 9,5 minuty, współbieżność ≤ 4. | Crawler pomija trasy wyszukiwania, rezerwacji i lotów, więc nie generuje ruchu do dostawców. | Brak. |
| Lighthouse | `lighthouse` (devDependency), `pnpm lighthouse -- --routes=…` | 13.3.0 | VERIFIED (lokalnie) | Mediana z 3 przebiegów na trzech szablonach, na przemian z buildem `main`. Wyniki są w `BASELINE.md`. | Pomiar laboratoryjny na localhost. INP nie da się zmierzyć w laboratorium, zastępczo podany jest TBT. | Zadanie w CI na Preview: BLOCKED_PERMISSIONS, bo ochrona wdrożeń Vercela wymaga sekretu obejścia (`OWNER_ACTIONS.md`, pkt 12). |
| GSC Search Analytics API | własny klient `src/lib/seo-ops/gsc/api-client.ts` (konto usługi, zakres tylko do odczytu, bez zależności) | — | INSTALLED_NOT_TESTED / BLOCKED_AUTH | 15 testów na podstawionych odpowiedziach (podpis JWT, stronicowanie, ponowienia, błędy bez sekretów). Nie uruchomiono na prawdziwym koncie, bo nie ma dostępu. Działa zamiennik: importer CSV i `pnpm seo:weekly`. | Pierwsze prawdziwe wywołanie może ujawnić różnice względem dokumentacji API. Dane żyją tylko w pamięci przebiegu. | Właściciel: konto usługi (`OWNER_ACTIONS.md`, pkt 5). Pierwsze uruchomienie w trybie próbnym. |
| Google Analytics MCP | — | — | BLOCKED_AUTH | Brak dostępu do GA4. Raport tygodniowy ma interfejs `Ga4Source` i oznacza stan `NOT_CONNECTED`. | Lejek od wejścia do rezerwacji nie jest liczony. | Właściciel: `OWNER_ACTIONS.md`, pkt 4 i 5. |
| GitHub CLI | `gh` | 2.90.0 | VERIFIED | `gh auth status`: zalogowany, zakresy `repo` i `workflow`. Użyty do utworzenia PR. | Token ma szeroki zakres `repo`. Nie był rozszerzany. | Brak. |
| Microsoft Clarity | — | — | NOT_NEEDED | Nie użyto. Dostęp do nagrań wymaga zgody właściciela i oceny prywatności. | — | Brak. |
| Ruff | — | — | NOT_NEEDED | Projekt jest w TypeScripcie. Jedyny skrypt Pythona to jednorazowe `scripts/seo/fix-diacritics.py`. | — | Brak. |
| Codex CLI | `codex` (wykonawca wg globalnych instrukcji właściciela) | 0.166.0 | VERIFIED | Zbudował potok silnika treści (kod zweryfikowany i poprawiony) i wykonał przebiegi ewaluacji skilli. Jego przegląd gałęzi przerwał limit konta, więc przegląd zrobił niezależny agent. | Wynik Codeksa zawsze wymaga weryfikacji (zostawił np. bajty NUL w wyrażeniach regularnych). | Brak. |

## Zmiany w konfiguracji i jak je cofnąć

Żaden plik konfiguracyjny nie został nadpisany w całości. Zmiany są dopisaniem wpisów i nie zawierają sekretów.

| Plik | Zmiana | Cofnięcie |
|---|---|---|
| `.claude/settings.json` w worktree (ignorowany przez git) | `enabledPlugins`: `frontend-design@claude-plugins-official`, `ui-ux-pro-max@ui-ux-pro-max-skill`, `21st@21st` | `claude plugin uninstall <nazwa> --scope project` |
| `~/.claude/plugins/known_marketplaces.json` | dodane marketplace'y `ui-ux-pro-max-skill` i `21st` | `claude plugin marketplace remove <nazwa>` |
| `~/.claude.json`, sekcja tego worktree | serwer MCP `chrome-devtools` | `claude mcp remove "chrome-devtools" -s local` |
| `.claude/launch.json` w worktree (ignorowany) | konfiguracje podglądu `next-dev`, `next-start`, `baseline-main-start` | usunąć plik |
| `package.json` | devDependencies `@anthropic-ai/sdk` 1.8.0 i `@axe-core/playwright` 4.14.0 oraz skrypty `seo:*`, `content:*`, `test:seo` | zwykły revert |

## Czego nie zainstalowano i dlaczego

- Drugiego serwera przeglądarki (Playwright MCP), bo dublowałby Chrome DevTools MCP.
- Społecznościowego MCP do GSC. Wymagałby audytu źródła, a bez OAuth i tak by nie działał.
- Niczego płatnego. Łączny koszt narzędzi w tej misji wynosi 0 zł.
