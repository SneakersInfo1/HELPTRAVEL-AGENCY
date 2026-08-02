import Image from "next/image";
import { MapPin, Star } from "lucide-react";

import { LocalizedLink } from "@/components/site/localized-link";
import { DestinationCarousel } from "./destination-carousel";
import { HOME_COPY, type SectionCopy } from "@/lib/home/copy";
import { formatDateRange, formatPricePln } from "@/lib/home/deal-card";
import { ratingLabel } from "@/lib/hotels/rating";
import { FEATURED_MIN, type FeaturedHotel } from "@/lib/hotels/featured-hotels";

// Sekcja „Polecane hotele" (2026-08-02, prośba właściciela po obejrzeniu
// strony pokazowej LiteAPI).
//
// CO ODRÓŻNIA JĄ OD PASA „POPULARNE KIERUNKI" NAD NIĄ — bo dwa sąsiadujące
// pasy kart z tą samą treścią w dwóch skórkach to najczęstszy błąd tej strony
// i już raz go tu popełniono:
//   • pas kierunków odpowiada na „DOKĄD" → miasto, czas lotu, cena orientacyjna,
//     link do WYNIKÓW wyszukiwania;
//   • ten pas odpowiada na „CO KONKRETNIE" → nazwany hotel, jego ocena, cena
//     z realnego wyszukania i link DO TEGO HOTELU na te same daty.
//
// Cały tekst pod ceną istnieje po to, żeby liczba nie była zagadką: dla ilu
// osób, za jaki okres i czy z podatkami. Bez tego „od 320 zł" jest obietnicą,
// którą użytkownik zweryfikuje dopiero na checkoucie — czyli najgorzej.

/** Polska odmiana „opinia" (1 opinia / 2–4 opinie / 5+ opinii). */
function opinieLabel(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (n === 1) return "opinia";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "opinie";
  return "opinii";
}

/** Polski zapis oceny 0–10: 9.1 → „9,1". */
function formatRating(score: number): string {
  return score.toFixed(1).replace(".", ",");
}

function hotelHref(h: FeaturedHotel): string {
  const params = new URLSearchParams({
    checkin: h.checkin,
    checkout: h.checkout,
    // Ten sam wariant, dla którego policzono cenę. Gdyby link szedł bez
    // parametrów, strona hotelu pokazałaby inne (albo żadne) stawki i liczba
    // z karty przestałaby się zgadzać w kolejnym kroku.
    adults: "2",
    rooms: "1",
  });
  return `/hotele/${h.id}?${params.toString()}`;
}

export function FeaturedHotels({
  hotels,
  copy = HOME_COPY.featuredHotels,
}: {
  hotels: FeaturedHotel[];
  copy?: SectionCopy;
}) {
  // Brak kompletu = brak sekcji. Pas z dwoma kaflami czyta się jak awaria,
  // a nie jak wybór redakcyjny.
  if (hotels.length < FEATURED_MIN) return null;

  // Wszystkie karty w zestawie pochodzą z jednego okna dat (patrz cron), więc
  // termin podajemy RAZ nad pasem zamiast powtarzać go na każdej karcie.
  const window = formatDateRange(hotels[0].checkin, hotels[0].checkout);

  return (
    <section aria-labelledby="featured-hotels" className="w-full px-4 sm:px-6 xl:px-8">
      <DestinationCarousel
        tone="light"
        listId="home_featured_hotels"
        listName={copy.heading}
        ariaLabel={{ prev: "Poprzednie hotele", next: "Następne hotele" }}
        slideClassName="min-w-0 shrink-0 basis-[78%] pl-3 sm:basis-[48%] sm:pl-4 lg:basis-[32%] xl:basis-[24%]"
        header={
          <div>
            <h2 id="featured-hotels" className="font-display text-2xl leading-tight text-ink sm:text-3xl">
              {copy.heading}
            </h2>
            {copy.subheading ? (
              <p className="mt-1 max-w-[62ch] text-sm leading-6 text-ink-muted">{copy.subheading}</p>
            ) : null}
          </div>
        }
        aside={
          window ? (
            <span className="text-right text-[11px] leading-tight text-ink-muted">
              Termin {window}
            </span>
          ) : undefined
        }
        items={hotels.map((h) => ({
          slug: h.id,
          name: h.name,
          category: h.cityLabel,
          node: <FeaturedHotelCard hotel={h} cta={copy.cta} />,
        }))}
      />
    </section>
  );
}

function FeaturedHotelCard({ hotel, cta }: { hotel: FeaturedHotel; cta?: string }) {
  const href = hotelHref(hotel);

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-md border border-line bg-surface-raised shadow-[var(--shadow-sm)] transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] active:scale-[0.995] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100">
      <div className="relative aspect-[16/11] w-full overflow-hidden bg-surface-sunken">
        <Image
          src={hotel.photo}
          // Nazwa hotelu wystarcza za opis: zdjęcie jest ILUSTRACJĄ linku, którego
          // etykietę niesie nagłówek obok. Powtórzenie „Zdjęcie hotelu X" kazałoby
          // czytnikowi ekranu przeczytać tę samą treść dwa razy pod rząd.
          alt=""
          fill
          sizes="(max-width: 640px) 78vw, (max-width: 1024px) 48vw, 24vw"
          className="object-cover transition duration-200 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
        {hotel.stars ? (
          <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-0.5 rounded-sm bg-black/55 px-2 py-1 text-white backdrop-blur-sm">
            <span className="sr-only">Kategoria {hotel.stars} na 5 gwiazdek</span>
            {Array.from({ length: hotel.stars }, (_, i) => (
              <Star key={i} aria-hidden className="h-3 w-3 fill-current" strokeWidth={0} />
            ))}
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3.5">
        {typeof hotel.rating === "number" ? (
          <div className="flex items-center gap-2">
            <span className="inline-flex min-w-9 items-center justify-center rounded-sm bg-brand px-1.5 py-0.5 text-sm font-bold text-white">
              {formatRating(hotel.rating)}
            </span>
            <span className="min-w-0 truncate text-xs font-semibold text-ink">
              {ratingLabel(hotel.rating)}
              {hotel.reviewCount ? (
                <span className="font-medium text-ink-muted">
                  {" · "}
                  {hotel.reviewCount} {opinieLabel(hotel.reviewCount)}
                </span>
              ) : null}
            </span>
          </div>
        ) : null}

        {/* Nagłówek niesie JEDYNY link karty, rozciągnięty pseudo-elementem na
            cały kafelek. Trzy osobne linki do tego samego adresu (obraz, tytuł,
            przycisk) to trzy przystanki tabulatora, na których czytnik ekranu
            czyta w kółko to samo. */}
        <h3 className="text-sm font-bold leading-snug text-ink">
          <LocalizedLink href={href} className="before:absolute before:inset-0">
            <span className="line-clamp-2">{hotel.name}</span>
          </LocalizedLink>
        </h3>

        <p className="flex items-center gap-1 text-xs text-ink-muted">
          <MapPin aria-hidden className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          <span className="truncate">
            {hotel.cityLabel}, {hotel.countryLabel}
          </span>
        </p>

        <div className="mt-auto flex items-end justify-between gap-2 border-t border-line pt-2.5">
          <div className="min-w-0">
            <p className="text-base font-bold leading-tight text-ink">
              <span className="whitespace-nowrap">
                od {formatPricePln(hotel.perNightPln)}
                <span className="text-[11px] font-medium text-ink-muted">/noc</span>
              </span>
            </p>
            {/* Trzy rzeczy, bez których cena jest nieporównywalna z żadną inną:
                dla ilu osób, ile pokoi, czy z podatkami. */}
            <p className="text-[11px] leading-tight text-ink-muted">
              2 osoby, 1 pokój · w tym podatki
            </p>
          </div>
          {cta ? (
            // Znacznik wizualny, nie drugi cel dotykowy: link karty już
            // obejmuje całą powierzchnię (patrz nagłówek wyżej).
            <span
              aria-hidden
              className="shrink-0 rounded-sm bg-brand-soft px-2.5 py-1.5 text-xs font-bold text-brand-strong transition group-hover:bg-brand group-hover:text-white"
            >
              {cta}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}
