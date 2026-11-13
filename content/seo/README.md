# HelpTravel SEO content store

Ten katalog jest repozytorium treści generowanych przez evidence-first content engine. Dokumenty JSON trafiają do podkatalogu zależnego od typu:

- `articles/` — nowe artykuły,
- `comparisons/` — rozszerzenia porównań,
- `months/` — rozszerzenia stron miesięcy,
- `hubs/` — rozszerzenia hubów.

`index.generated.ts` jest odtwarzany atomowo przez `scripts/content-engine/run.ts`. Nie należy edytować go ręcznie. Plik `KILL_SWITCH` umieszczony w tym katalogu zatrzymuje przebieg przed pierwszym wywołaniem modelu.

Treść w statusie `in_review` wymaga przeglądu w pull requeście. Status `approved` może zostać nadany automatycznie wyłącznie dokumentowi klasy `EVERGREEN`, który przeszedł bramkę z wynikiem `PASS`, w jawnym trybie `AUTO_EVERGREEN`.

