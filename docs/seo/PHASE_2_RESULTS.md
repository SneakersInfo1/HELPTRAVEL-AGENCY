# Etap 2 — techniczne SEO: wyniki

## Co zmieniono

| Zmiana | Szczegóły | Commit |
|---|---|---|
| Przekierowania literówek | `/porównanie/…` i `/porunanie/…` dostają 301 do istniejącej pary albo do huba porównań. Wcześniej było to 404 mimo wyświetleń w GSC. Kod: `middleware.ts`, `src/lib/seo/legacy-redirects.ts`. | `58b91c3` |
| Polskie znaki | 334 wiersze treści bez znaków diakrytycznych („Gdzie poleciec”) poprawione w tytułach, nagłówkach i tekstach. | `9ec54a2` |
| Obraz i karta społecznościowa | Next łączy `openGraph` płytko, więc strona z własnym `openGraph` gubiła obraz z układu nadrzędnego. `completeSocial` i `socialMeta` (`src/lib/seo/social-meta.ts`) dokładają obraz domyślny i kartę Twittera z tytułem strony. Zastosowane na 18 stronach statycznych oraz w hubach, listach i artykułach. | `017ea92`, `041cb35` |
| Tytuły | Porównania i huby mają tytuł bezwzględny do 60 znaków. Strony miesięcy dostały `monthWeatherTitle`, który dobiera wariant do długości. | `017ea92`, `041cb35`, `c676c7e` |
| Mapa witryny | `lastmod` pochodzi wyłącznie z daty merytorycznej zmiany dokumentu treści. Strony bez dokumentu nie mają `lastmod`. | `017ea92` |
| Dane strukturalne | Okruszki porównań prowadzą przez `/porownanie`. `Article.dateModified` i `citation` pojawiają się tylko przy dokumencie treści. `FAQPage` odpowiada widocznemu FAQ. `ItemList` huba zawiera tylko przewodniki, bez adresów wyszukiwarki zablokowanych w `robots.txt`. | `017ea92`, `c676c7e` |
| Zdania generatora porównań | Nazwa miasta stoi po dwukropku („Taniej zwykle: Walencja”), co usuwa błędy zgody typu „lepszy jest Ateny”. | `b4d9a22` |

## Dowody

- Test dymny po buildzie (`pnpm seo:smoke`): 263/263. Sprawdza statusy, tytuły, opisy, canonicale, robots, JSON-LD, obrazy społecznościowe, przekierowania, 404 trasy laboratoryjnej i `lastmod`.
- Crawl buildu: 0 niedziałających linków, 0 błędów JSON-LD, 0 stron bez `og:image` (przed: 55), 0 zmian dyrektywy robots.
- Dokumentacja Next.js (Context7) potwierdza płytkie łączenie metadanych i znikanie odziedziczonego obrazu.

## Czego celowo nie ruszano

- Polityki indeksu stron miesięcy (zamrożone 1039 stron indeksowalnych) i mapy witryny.
- `robots.txt`, w tym `Disallow` dla `/hotele/rezerwacja`.
- Szablonu tytułów przewodników po kierunkach (184 tytuły dłuższe niż 60 znaków przez dopisek marki).
- Strony głównej i wspólnej powłoki serwisu.

Decyzje w tych sprawach są w `OWNER_ACTIONS.md`.
