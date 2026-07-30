# HelpTravel

Polski serwis rezerwacyjny (helptravel.pl): wyszukiwarka i rezerwacja **hoteli** oraz **lotów**, wsparta warstwą treści (kierunki, przewodniki, inspiracje) pod SEO.

Rezerwacja odbywa się u nas — nie przez przekierowanie do partnera. Rozliczeniowo merchant of record jest NUITEE TRAVEL (LiteAPI), płatność kartą lub Google Pay.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS
- **LiteAPI** — jedyny dostawca: hotele (`/data`, `/hotels/rates`, prebook/book) i loty (LiteAPI Flights)
- Upstash Redis — cache stawek, snapshot cen, rate limiting
- Prisma + Postgres — analityka, sesje, zapisane wyjazdy
- OpenRouter — model AI concierge'a (czat doboru wyjazdu)
- Resend (e-mail), Geoapify (geokodowanie), Pexels (zdjęcia)
- Vercel — deployment produkcyjny

> Travelpayouts / Hotellook / Aviasales / Stay22 / CJ zostały **całkowicie usunięte**. Linki kierunkowe prowadzą wyłącznie do naszych własnych ścieżek (`/hotele/szukaj`, wyszukiwarka lotów).

## Uruchomienie lokalne

Menedżer pakietów: **pnpm** (w repo jest `pnpm-lock.yaml`).

```bash
pnpm install
cp .env.example .env.local   # uzupełnij wartości
pnpm db:push
pnpm dev                     # http://localhost:3000
```

## Weryfikacja

```bash
pnpm lint
pnpm test
pnpm build
```

Pojedynczy plik testowy:

```bash
node --import tsx --test src/lib/concierge/tools.test.ts
```

Testy uruchamiane są z **jawnej listy plików** w `package.json` — nowy plik `*.test.ts` trzeba tam dopisać, inaczej nigdy się nie wykona.

Smoke'i uderzające w prawdziwe API (czytają `.env.local`):

```bash
pnpm smoke:liteapi
pnpm booking:smoke
```

## Zmienne środowiskowe

Źródłem prawdy jest **`.env.example`** — zawiera komplet zmiennych z komentarzami (m.in. które klucze LiteAPI idą w `X-API-Key`, a które są publiczne dla widgetu płatności). Skopiuj go do `.env.local`; na Vercelu dodaj każdą zmienną osobno.

Minimum do startu lokalnego: `DATABASE_URL`, `NEXT_PUBLIC_SITE_URL`, klucze LiteAPI (`sand_` wystarczy do wyszukiwania). Bez `UPSTASH_*` aplikacja działa, tylko bez cache'u i rate limitingu.

Testy płatności obciążają prawdziwą kartę — używaj klucza `sand_`.

## Główne sekcje

Rezerwacje: `/hotele` (wyszukiwarka, karta hotelu, checkout), `/loty` (wyniki, rezerwacja), `/wyjazdy/[typ]`, `/oferta`, `/cennik`.

Treści i SEO: `/kierunki`, `/najlepsze-kierunki`, `/inspiracje`, `/przewodniki`, `/porownanie`, `/city-breaki`, `/cieple-kierunki`, `/bez-wizy`, `/tanie-podroze`, `/weekendowe-wyjazdy`.

Zaufanie i formalności: `/o-nas`, `/faq`, `/jak-pracujemy`, `/redakcja`, `/standard-redakcyjny`, `/regulamin`, `/polityka-prywatnosci`, `/dla-partnerow`, `/mapa-serwisu`.

AI concierge (czat doboru wyjazdu) jest montowany w layoucie na każdej stronie; wyłącznik: `NEXT_PUBLIC_SHOW_CONCIERGE=false`.

## Deploy

Vercel, gałąź **`main` idzie prosto na produkcję**. Zmienne środowiskowe ustawiane w Project Settings.

Crony (`vercel.json`) grzeją cache i budują snapshot cen:

- `/api/cron/warm-rates` — co 30 min
- `/api/cron/warm-flights` — :15 i :45

Po wdrożeniu: `docs/post-deploy-checklist.md`.

## Zasady produktowe

- **Ceny nigdy nie są zmyślane.** Każda kwota pochodzi z realnego wyszukania LiteAPI; wpis starszy niż 48 h traktujemy jak brak ceny. Gdy dostawca nic nie zwraca, pokazujemy pusty stan — nie szacunek.
- To samo dotyczy AI concierge'a: kwoty, terminy i oceny wyłącznie z wyników narzędzi, nigdy z „pamięci" modelu.
- Warstwa treści ma wspierać SEO i wiarygodność wydawniczą.

## Dokumentacja

- `CLAUDE.md` — architektura, konwencje i pułapki (czytaj przed większą zmianą)
- `docs/booking-flow.md` — ścieżka rezerwacji, `docs/analytics-events.md` — eventy GA4
- `PRODUCT.md` — zasady produktowe
