# SEO daily — instrukcja dla właściciela

Praca SEO odbywa się w zwykłej sesji Claude Code, którą uruchamiasz sam, codziennie albo co dwa dni. Nie ma harmonogramu, automatu w chmurze ani płatnych wywołań API modeli: analizę, research, pisanie, kod i testy wykonuje Claude w sesji, w ramach Twojego abonamentu.

## Uruchomienie (jedna wiadomość)

1. Otwórz aplikację Claude, zakładkę **Code**, i wybierz projekt `helptravel-agency`.
2. Rozpocznij nową sesję i wyślij jedną wiadomość:

   ```text
   /seo-daily
   ```

To wszystko. Sesja sama: sprawdzi stan poprzednich PR-ów i dziennik, znajdzie najnowszy eksport GSC i oceni jego świeżość, ułoży plan według dowodów, wykona wybrane zadania, uruchomi testy, otworzy PR i zapisze dziennik. Na końcu dostaniesz raport w czacie z linkiem do PR.

- Sesja trwa zwykle od kilkunastu minut do godziny (build i testy przeglądarkowe zajmują najwięcej).
- Jeśli sesja pyta o zgodę na polecenia, możesz wybrać tryb, w którym pyta rzadziej. Sesja nigdy nie scala PR i nie wdraża na produkcję.
- Jeśli w trakcie skończy się limit abonamentu, sesja się zatrzyma. Nie włączaj płatnego dodatkowego zużycia — wróć do tej sesji po odnowieniu limitu i napisz „kontynuuj”.

## Dane z Google Search Console (raz na kilka dni)

Sesja nie potrzebuje API GSC. Wystarczy eksport z interfejsu:

1. [Search Console](https://search.google.com/search-console) → usługa `helptravel.pl` → **Skuteczność** → **Wyniki wyszukiwania**.
2. Zakres dat: **Ostatnie 3 miesiące** (albo 28 dni). Porównanie okresów też działa — sesja bierze okres bieżący.
3. **Eksportuj** → **Pobierz CSV**. Plik ZIP zostaw w folderze **Pobrane** — sesja sama znajdzie najnowszy. (Możesz go też włożyć do `seo-private/gsc-inbox/` w katalogu projektu.)

Sesja odczyta, do kiedy sięgają dane, i oceni ich świeżość:

- do 10 dni — dane aktualne, praca „pod popyt”;
- 11–35 dni — tylko jako wskazówka, raport poprosi o nowy eksport;
- powyżej 35 dni albo brak eksportu — sesja nie podejmuje decyzji na podstawie popytu, pracuje nad świeżością faktów, kolejką i jakością.

Eksport zostaje na Twoim dysku. Do repozytorium (publicznego) nie trafiają żadne surowe dane GSC.

## Przegląd PR (co robisz po sesji)

Sesja ze zmianami otwiera jeden PR z etykietą `seo-daily`. W PR:

- przeczytaj opis: zadania, dowody, wynik bramki jakości i testów;
- dokument treści ma status `in_review`. Kontrola „SEO content check” jest czerwona, dopóki go nie zatwierdzisz. Zatwierdzenie na gałęzi PR (polecenie z identyfikatorem jest w opisie PR):

  ```bash
  pnpm content:verify -- --approve <id-dokumentu> --by "Imię Nazwisko" --write
  ```

  Możesz też napisać w nowej sesji: „zatwierdź dokument z PR #… jako <imię i nazwisko>” — Claude uruchomi to polecenie, ale scalenie PR należy do Ciebie.
- scalenie PR = publikacja po Twojej decyzji. Zamknięcie PR bez scalania sesja odczyta jako odrzucenie tematu i nie wróci do niego.

## Pamięć między sesjami

Kolejka tematów i dziennik pracy są w gałęzi `claude/seo-engine-state` tego repozytorium, w folderze `daily/`:

- `daily/QUEUE.md` — tematy: do zrobienia, w toku, w przeglądzie, zrobione, odrzucone, „nie wracać”;
- `daily/JOURNAL.md` — co zrobiła każda sesja, z linkami do PR i kolejnymi krokami.

Możesz je czytać na GitHubie (przełącz gałąź na `claude/seo-engine-state`). Żeby dodać temat od siebie, napisz w sesji np. „dodaj do kolejki SEO: …” — sesja wpisze go poleceniem `pnpm seo:daily queue add`.

## Czego sesja nie robi bez Ciebie

- nie scala PR i nie pushuje do `main`;
- nie zmienia polityki indeksowania (`noindex`, `robots`, `canonical`, sitemap, przekierowania), zależności, CI ani ustawień Claude — `publish` odrzuca takie zmiany mechanicznie, a sesja zapisuje je w kolejce jako Twoją decyzję;
- nie wywołuje płatnych API modeli i nie instaluje płatnych usług;
- nie tworzy treści na siłę: dzień bez zmian jest poprawnym wynikiem.

Dodatkowa warstwa: `.claude/settings.json` blokuje w sesjach Claude bezpośredni push do `main`, force push i `curl` do API modeli. To nie zastępuje ochrony gałęzi `main` na GitHubie (`OWNER_ACTIONS.md`, pkt 15).

## Instalacja polecenia `/seo-daily`

Polecenie to skill użytkownika w `%USERPROFILE%\.claude\skills\seo-daily\SKILL.md` (lokalnie, poza gitem), dostępny w każdej sesji; w innym repozytorium sam się wycofa. Kopia w repozytorium: `docs/seo/daily/seo-daily.SKILL.md`. Na nowym komputerze skopiuj ją do `~/.claude/skills/seo-daily/SKILL.md` (albo do `.claude/skills/seo-daily/SKILL.md` w katalogu projektu).

Skill tylko uruchamia procedurę z repozytorium (`docs/seo/daily/PROCEDURE.md`, zawsze w aktualnej wersji z GitHuba), więc zmiany procedury przechodzą przez zwykły PR.

## Wyłączona alternatywa: silnik z modelem przez API

`pnpm content:run` z modelem Anthropic przez API zostaje w repozytorium, ale jest wyłączony: wymaga jednocześnie klucza `SEO_ENGINE_ANTHROPIC_API_KEY` i jawnej flagi `--allow-paid-api`. Workflow „SEO content engine (offline)” nie ma harmonogramu ani ścieżki z kluczem — uruchamia tylko scenariusz testowy offline. Polecenia `pnpm seo:daily` kończą się błędem, jeśli w środowisku jest klucz silnika. Opis dawnego automatu: `docs/seo/AUTOMATION_RUNBOOK.md`.
