# HelpTravel Agency

HelpTravel Agency to hybryda:
- travel plannera
- katalogu kierunkow
- serwisu z inspiracjami i przewodnikami

Projekt jest zbudowany w Next.js i przygotowany pod publiczny serwis travelowy z tresciami, plannerem, SEO pages oraz flow afiliacyjnym.

## Stack

- Next.js App Router + TypeScript + Tailwind CSS
- Prisma + Postgres
- Duffel, Geoapify, Pexels
- opcjonalnie OpenAI do lepszego rozumienia intencji w trybie discovery
- Vercel jako docelowy deployment

## Publiczne sekcje

- `/` - strona glowna
- `/planner` - planner pod discovery i konkretny kierunek
- `/kierunki` - katalog destination hubow
- `/kierunki/[slug]` - strony kierunkow
- `/inspiracje` - index artykulow
- `/inspiracje/[slug]` - artykuly i scenariusze wyjazdow
- `/przewodniki`
- `/city-breaki`
- `/cieple-kierunki`
- `/bez-wizy`
- `/tanie-podroze`
- `/weekendowe-wyjazdy`
- `/o-nas`
- `/kontakt`
- `/polityka-prywatnosci`
- `/regulamin`
- `/linki-partnerskie`
- `/dla-partnerow`
- `/standard-redakcyjny`
- `/mapa-serwisu`
- `/jak-pracujemy`

## Wymagane env

Podstawowe:

- `DATABASE_URL`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_CONTACT_EMAIL` - opcjonalne, ale zalecane dla publicznej strony kontaktowej
- `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` - opcjonalne, jezeli chcesz podpiac Google Search Console

Integracje:

- `DUFFEL_ACCESS_TOKEN`
- `DUFFEL_API_URL`
- `DUFFEL_VERSION`
- `PEXELS_API_KEY`
- `GEOAPIFY_API_KEY`
- `HOTELBEDS_HOTEL_API_KEY`
- `HOTELBEDS_HOTEL_API_SECRET`
- `HOTELBEDS_HOTEL_API_URL`
- `HOTELBEDS_ACTIVITIES_API_KEY`
- `HOTELBEDS_ACTIVITIES_API_SECRET`
- `HOTELBEDS_ACTIVITIES_API_URL`
- `HOTELBEDS_TRANSFER_API_KEY`
- `HOTELBEDS_TRANSFER_API_SECRET`
- `HOTELBEDS_TRANSFER_API_URL`

Opcjonalne:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`

## Uruchomienie lokalne

```bash
pnpm install
pnpm db:push
pnpm db:seed
pnpm dev
```

Potem otworz:

```text
http://localhost:3000
```

## Weryfikacja

```bash
pnpm lint
pnpm test
pnpm build
```

## Deploy na Vercel

1. Wypchnij repo na GitHub.
2. Importuj projekt do Vercela.
3. Dodaj wszystkie env-y z `.env.example`.
4. Ustaw `NEXT_PUBLIC_SITE_URL` na produkcyjny adres Vercela lub wlasna domene.
5. Zrob deploy.

## Search Console

Jesli chcesz przyspieszyc indeksacje:

1. Dodaj witryne w Google Search Console.
2. Pobierz kod weryfikacyjny typu `google-site-verification`.
3. Wklej go do `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` w `.env.local` i w Vercelu.
4. Po deployu przejdz do Search Console i wyślij sitemapę: `/sitemap.xml`.

## Uwagi produktowe

- Glowne flow ofertowe ma pokazywac realne ceny tylko z providerow.
- Gdy feed providerowy nie zwraca danych, aplikacja pokazuje pusty stan zamiast sztucznych cen.
- Warstwa contentowa ma wspierac SEO, wiarygodnosc wydawnicza i approval w programach afiliacyjnych.
