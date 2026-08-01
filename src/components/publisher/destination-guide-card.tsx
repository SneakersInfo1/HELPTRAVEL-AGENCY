"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";

import { useLanguage } from "@/components/site/language-provider";
import { LocalizedLink } from "@/components/site/localized-link";
import { sendClientEvent } from "@/lib/mvp/client-events";
import { localeFromPathname, type SiteLocale } from "@/lib/mvp/locale";
import type { DestinationProfile } from "@/lib/mvp/types";
import type { DestinationMedia } from "@/lib/mvp/visuals";

export function DestinationGuideCard({
  destination,
  media,
  summary,
  locale: localeOverride,
}: {
  destination: DestinationProfile;
  media: DestinationMedia;
  summary: string;
  locale?: SiteLocale;
}) {
  const pathname = usePathname();
  const { locale: contextLocale } = useLanguage();
  const locale = localeOverride ?? localeFromPathname(pathname) ?? contextLocale;
  const source =
    pathname?.startsWith("/kierunki")
      ? "destinations_index"
      : pathname?.startsWith("/inspiracje") || pathname?.startsWith("/city-breaki") || pathname?.startsWith("/cieple-kierunki")
        ? "content_hub"
        : pathname?.startsWith("/hotele")
          ? "hotels"
          : "homepage";
  const copy =
    locale === "en"
      ? {
          openGuide: "Open guide",
          flight: "flight",
          style: "style",
          budget: "budget",
          beach: "beach",
          city: "city",
          value: "better value",
          mid: "mid+",
          showDestination: "View destination",
          planner: "Check hotels",
        }
      : {
          openGuide: "Otwórz przewodnik",
          flight: "lot ok.",
          style: "styl",
          budget: "budżet",
          beach: "plaża",
          city: "miasto",
          value: "bardziej opłacalny",
          mid: "średni+",
          showDestination: "Zobacz kierunek",
          planner: "Sprawdź hotele",
        };

  return (
    <article className="group overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-sm transition duration-200 ease-out hover:-translate-y-1 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      <LocalizedLink
        href={`/kierunki/${destination.slug}`}
        locale={locale}
        onClick={() =>
          sendClientEvent("destination_card_clicked", {
            slug: destination.slug,
            city: destination.city,
            action: "guide",
            source,
            locale,
          })
        }
        className="relative block h-56"
      >
        <Image
          src={media.heroImage}
          alt=""
          fill
          sizes="(max-width: 768px) 100vw, 33vw"
          className="object-cover"
        />
        {/* Scrim przypięty do bloku tekstu (0,72 = zmierzona podłoga dla 4,5:1
            bieli na najjaśniejszym zdjęciu). Poprzednia wersja kończyła się na
            0,5 i nazwa miasta potrafiła zniknąć na jasnym kadrze. */}
        <div className="absolute inset-x-0 bottom-0">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-full h-10 bg-[linear-gradient(to_top,rgba(5,18,11,0.72),rgba(5,18,11,0))]"
          />
          <div className="relative bg-[linear-gradient(180deg,rgba(5,18,11,0.72)_0%,rgba(5,18,11,0.93)_45%,rgba(5,18,11,0.96)_100%)] p-4 text-white">
            <p className="text-xs text-white/85">{destination.country}</p>
            <h3 className="mt-0.5 font-display text-2xl leading-tight text-white">{destination.city}</h3>
          </div>
        </div>
      </LocalizedLink>

      <div className="p-5">
        <p className="line-clamp-3 text-sm leading-6 text-ink-muted">{summary}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-sm bg-surface-sunken px-2.5 py-1 text-xs font-semibold text-ink">
            {/* Przecinek: liczba dla polskiego użytkownika. */}
            {copy.flight} {destination.typicalFlightHoursFromPL.toFixed(1).replace(".", ",")} h
          </span>
          <span className="rounded-sm bg-surface-sunken px-2.5 py-1 text-xs font-semibold text-ink">
            {copy.style} {destination.beachScore >= 0.7 ? copy.beach : copy.city}
          </span>
          <span className="rounded-sm bg-surface-sunken px-2.5 py-1 text-xs font-semibold text-ink">
            {copy.budget} {destination.costIndex <= 1 ? copy.value : copy.mid}
          </span>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <LocalizedLink
            href={`/kierunki/${destination.slug}`}
            locale={locale}
            onClick={() =>
              sendClientEvent("destination_card_clicked", {
                slug: destination.slug,
                city: destination.city,
                action: "guide",
                source,
                locale,
              })
            }
            className="inline-flex min-h-11 items-center rounded-full bg-brand px-5 transition duration-150 ease-out active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            <span className="text-sm font-bold text-white">{copy.showDestination}</span>
          </LocalizedLink>
          <LocalizedLink
            href={`/hotele/szukaj?${new URLSearchParams({
              destination: destination.city,
              country: destination.country,
              origin: "Warszawa",
              adults: "2",
              rooms: "1",
            }).toString()}`}
            locale={locale}
            onClick={() =>
              sendClientEvent("destination_card_clicked", {
                slug: destination.slug,
                city: destination.city,
                action: "hotels",
                source,
                locale,
              })
            }
            className="inline-flex min-h-11 items-center rounded-full border border-line px-5 transition duration-150 ease-out hover:bg-surface-sunken active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            <span className="text-sm font-semibold text-ink">{copy.planner}</span>
          </LocalizedLink>
        </div>
      </div>
    </article>
  );
}

