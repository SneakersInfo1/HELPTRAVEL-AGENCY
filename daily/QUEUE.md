# Kolejka tematów SEO

Plik generowany przez `pnpm seo:daily queue` — nie edytuj ręcznie, zmiany przez CLI.
Statusy `done`, `rejected` i `do_not_redo` oznaczają tematy, których nie opracowujemy ponownie.

| Status | Priorytet | Rodzaj | Cel | Temat | Dlaczego | PR |
|---|---|---|---|---|---|---|
| pending_review | 75 | content_new | `/porownanie/barcelona-spain-vs-malaga-spain` | Dokument ze źródłami: Barcelona czy Malaga | Porównanie ma popyt w GSC i pozycję w pierwszej piątce, ale CTR poniżej oczekiwanego i brak dokumentu ze zweryfikowanymi faktami. | https://github.com/SneakersInfo1/HELPTRAVEL-AGENCY/pull/156 |
| todo | 45 | technical | `src/lib/content-engine/site-content.ts` | Podgląd dokumentów in_review na Vercel Preview | Strona renderuje tylko dokumenty approved, a flaga SEO_PREVIEW_DRAFTS nie jest ustawiona dla Preview, więc propozycji nie widać na podglądzie PR. |  |
| todo | 40 | technical | `src/lib/content-engine/sources.ts` | Źródło UNESCO zwraca 403 przy pobieraniu | Strona whc.unesco.org odrzuca pobieranie silnika, więc kuratorowane twierdzenia UNESCO (np. dzieła Gaudíego) wypadają z dokumentów. |  |
| todo | 30 | technical | `/wyjazdy/gory` | Zdjęcie wulkanu Teide na karcie „Teneryfa (Teide)” w hubie „góry” | Karta pokazuje Auditorio w Santa Cruz: właściwa wyspa, ale nie temat karty. Potrzebne zweryfikowane zdjęcie Teide jako osobne zdjęcie karty, bo photoSlug wskazuje zdjęcie kierunku santa-cruz-de-tenerife-spain z rejestru. |  |
