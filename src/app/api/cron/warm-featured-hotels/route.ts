// /api/cron/warm-featured-hotels — sekcja „Polecane hotele" na stronie głównej.
//
// PO CO ISTNIEJE OSOBNY CRON
// Właściciel poprosił o zestaw, który „zmienia się raz na 6 godzin". Grzanie
// cen kierunków (`warm-rates`, co 30 min) odpowiada na inne pytanie — ile
// kosztuje NAJTAŃSZY nocleg w mieście — i nie zapamiętuje, KTÓRY to hotel.
// Sekcja polecanych potrzebuje konkretu: nazwy, zdjęcia, oceny i ceny jednego
// obiektu, z linkiem prowadzącym dokładnie do niego na te same daty.
//
// DLACZEGO NIE ENDPOINT DOSTAWCY
// Strona pokazowa LiteAPI ma `/v1/hotels/recommended`, ale to backend
// white-labela, nie publiczne API. Sonda 2026-08-02 kluczem produkcyjnym:
// `api.liteapi.travel/v3.0/hotels/recommended` → 404. Zestaw budujemy więc
// sami z `/data/hotels` (metadane) + `resolveSlimRates` (stawki) — czyli z tych
// samych wywołań, które obsługują listę wyników.
//
// KOSZT. Jedno okno rotacji to `FEATURED_DESTINATIONS_PER_RUN` kierunków po
// jednym wywołaniu stawek (metadane siedzą w Next Data Cache na 24 h), czyli
// rząd kilkunastu sekund. Cron chodzi cztery razy na dobę.
//
// Bezpieczeństwo: `Authorization: Bearer ${CRON_SECRET}` — jak pozostałe crony.

import { NextRequest, NextResponse } from "next/server";
import { zajmijBlokade } from "@/lib/cron/lock";

import { fetchHotelsForDestination } from "@/lib/liteapi";
import { getDestinationProfileBySlug } from "@/lib/mvp/destinations";
import { localizeCity, localizeCountry } from "@/lib/mvp/i18n-geo";
import { resolveSlimRates } from "@/lib/hotels/resolve-slim-rates";
import type { RateCacheContext } from "@/lib/hotels/rate-cache";
import {
  FEATURED_MIN,
  credibilityScore,
  pickValuePicks,
  rotationBucket,
  rotateSlice,
  writeFeaturedHotels,
  type FeaturedHotel,
} from "@/lib/hotels/featured-hotels";
import {
  FEATURED_DESTINATION_POOL,
  FEATURED_DESTINATIONS_PER_RUN,
  FEATURED_HOTELS_PER_DEST,
  FEATURED_LEAD_DAYS,
  FEATURED_MIN_REVIEWS,
  FEATURED_NIGHTS,
  FEATURED_SCAN_HOTELS,
} from "@/lib/hotels/warm-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

/** Data w formacie YYYY-MM-DD, przesunięta o N dni od `from`. UTC — cron chodzi w UTC. */
function isoPlusDays(from: Date, days: number): string {
  const d = new Date(from.getTime() + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn("[cron/warm-featured] CRON_SECRET nie ustawiony — odmawiam (ustaw zmienną w Vercel).");
    return NextResponse.json({ error: "cron_not_configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Blokada rozproszona — patrz src/lib/cron/lock.ts. Nakladajace sie
  // przebiegi dublowaly koszt LiteAPI i gubily aktualizacje przy
  // wzorcu odczyt-scal-zapis. Zajete = 200 "skipped_locked", bo to
  // sytuacja normalna; 5xx wywolaloby ponawianie i pogorszylo sprawe.
  const blokada = await zajmijBlokade("warm-featured-hotels", 360);
  if (!blokada.zdobyta) {
    console.info("[cron/warm-featured-hotels] poprzedni przebieg wciaz trwa — pomijam");
    return NextResponse.json({ ok: true, status: "skipped_locked" });
  }

  const startedAt = Date.now();
  const bucket = rotationBucket(startedAt);
  const slugs = rotateSlice(FEATURED_DESTINATION_POOL, FEATURED_DESTINATIONS_PER_RUN, bucket);

  // JEDNO okno dat dla całego zestawu — dzięki temu wszystkie karty w pasie
  // mówią o tym samym terminie i cena jednej jest porównywalna z ceną drugiej.
  // Wyprzedzenie ~4 tygodni: bliżej niż to pula ofert bywa przetrzebiona,
  // a dalej ceny przestają odpowiadać temu, co użytkownik dostanie „teraz".
  const today = new Date(startedAt);
  const checkin = isoPlusDays(today, FEATURED_LEAD_DAYS);
  const checkout = isoPlusDays(today, FEATURED_LEAD_DAYS + FEATURED_NIGHTS);
  const ctx: RateCacheContext = {
    checkin,
    checkout,
    // Ten sam wariant, który grzeje `warm-rates`: 2 dorosłych, 1 pokój, PLN.
    // Inny wariant oznaczałby zimny cache i ~3,3 s na kierunek.
    adults: 2,
    children: [],
    rooms: 1,
    currency: "PLN",
  };

  const collected: FeaturedHotel[] = [];
  const diag: Array<{ slug: string; scanned: number; priced: number; taken: number }> = [];

  // Sekwencyjnie, nie równolegle: to nie jest ścieżka użytkownika, a przy
  // czterech przebiegach na dobę kilkanaście sekund nie ma znaczenia. Za to
  // sekwencja nie konkuruje o limit LiteAPI z `warm-rates`, który potrafi
  // startować w tej samej minucie.
  for (const slug of slugs) {
    const profile = getDestinationProfileBySlug(slug);
    if (!profile) {
      console.warn(`[cron/warm-featured] kierunek '${slug}' nie ma profilu — pomijam`);
      continue;
    }
    try {
      const list = await fetchHotelsForDestination({
        city: profile.city,
        country: profile.country,
        limit: FEATURED_SCAN_HOTELS,
      });
      // Kandydaci PRZED zapytaniem o ceny: bez zdjęcia i bez oceny karta i tak
      // nie wejdzie do pasa, a każdy taki hotel zajmowałby miejsce w paczce
      // stawek (jeden call LiteAPI obsługuje ≤50 identyfikatorów).
      const candidates = (list.data ?? [])
        .filter((h) => Boolean(h.main_photo ?? h.thumbnail))
        .filter((h) => typeof h.rating === "number" && h.rating > 0)
        // Minimum opinii: „polecamy" na podstawie trzech ocen to nie jest
        // polecenie. Próg odsiewa też obiekty świeżo dodane u dostawcy,
        // które mają 10,0 wyłącznie dlatego, że nikt ich jeszcze nie ocenił.
        .filter((h) => (h.reviewCount ?? 0) >= FEATURED_MIN_REVIEWS)
        .sort(
          (a, b) =>
            credibilityScore(b.rating ?? undefined, b.reviewCount ?? undefined) -
            credibilityScore(a.rating ?? undefined, a.reviewCount ?? undefined),
        )
        .slice(0, 50);

      if (candidates.length === 0) {
        diag.push({ slug, scanned: list.data?.length ?? 0, priced: 0, taken: 0 });
        continue;
      }

      const rates = await resolveSlimRates(
        candidates.map((h) => h.id),
        ctx,
        { forceRefresh: true },
      );

      const priced = candidates
        .map((h): FeaturedHotel | null => {
          const rate = rates.rates[h.id];
          if (!rate || !Number.isFinite(rate.totalAmount) || rate.totalAmount <= 0) return null;
          // `totalAmount` dotyczy CAŁEGO okna dla pokoju 2-osobowego. Cena za
          // dobę jest ilorazem — tak samo, jak liczy ją snapshot kierunków,
          // więc obie liczby na stronie znaczą to samo.
          const perNight = Math.floor(rate.totalAmount / FEATURED_NIGHTS);
          if (perNight <= 0) return null;
          const photo = h.main_photo ?? h.thumbnail;
          if (!photo) return null;
          return {
            id: h.id,
            name: h.name,
            cityLabel: localizeCity(profile.city),
            countryLabel: localizeCountry(profile.country),
            stars: typeof h.stars === "number" && h.stars > 0 ? h.stars : undefined,
            rating: typeof h.rating === "number" ? h.rating : undefined,
            reviewCount:
              typeof h.reviewCount === "number" && h.reviewCount > 0 ? h.reviewCount : undefined,
            photo,
            perNightPln: perNight,
            totalPln: Math.floor(rate.totalAmount),
            checkin,
            checkout,
          };
        })
        .filter((h): h is FeaturedHotel => h !== null);

      // Limit na kierunek — inaczej jedno miasto z bogatą podażą zajęłoby cały
      // pas i sekcja przestałaby być przeglądem oferty.
      //
      // `pickValuePicks`, nie sam ranking jakości: bierze najlepiej oceniane
      // Z TAŃSZEJ CZĘŚCI wycenionych ofert tego kierunku (próg = mediana cen
      // tego przebiegu). Powód i pomiary — patrz lib/hotels/featured-hotels.ts.
      const taken = pickValuePicks(priced, FEATURED_HOTELS_PER_DEST);
      collected.push(...taken);
      diag.push({ slug, scanned: candidates.length, priced: priced.length, taken: taken.length });
    } catch (err) {
      // Kierunek, który padł, nie może zabrać ze sobą całego przebiegu.
      console.warn(
        `[cron/warm-featured] kierunek '${slug}' pominięty:`,
        err instanceof Error ? err.message : err,
      );
      diag.push({ slug, scanned: 0, priced: 0, taken: 0 });
    }
  }

  // Zapis TYLKO gdy zestaw jest kompletny na tyle, żeby sekcja się pokazała.
  // Nadpisanie działającego snapshotu wynikiem nieudanego przebiegu skasowałoby
  // sekcję na sześć godzin — lepiej zostawić poprzednie, wciąż świeże dane.
  const wrote = collected.length >= FEATURED_MIN;
  if (wrote) await writeFeaturedHotels(collected, startedAt);
  else console.warn(`[cron/warm-featured] tylko ${collected.length} hoteli — zostawiam poprzedni snapshot`);

  await blokada.zwolnij();
  return NextResponse.json({
    ok: true,
    bucket,
    window: { checkin, checkout },
    destinations: slugs,
    collected: collected.length,
    wrote,
    diag,
    tookMs: Date.now() - startedAt,
  });
}
