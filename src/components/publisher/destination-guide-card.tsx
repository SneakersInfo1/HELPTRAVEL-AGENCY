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
        : pathname?.startsWith("/planner")
          ? "planner"
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
          planner: "Open in planner",
        }
      : {
          openGuide: "Otwórz przewodnik",
          flight: "lot ok.",
          style: "styl",
          budget: "budżet",
          beach: "plażą",
          city: "miasto",
          value: "bardziej oplacalny",
          mid: "średni+",
          showDestination: "Zobacz kierunek",
          planner: "Sprawdź w plannerze",
        };

  return (
    <article className="group overflow-hidden rounded-[1.75rem] border border-emerald-900/10 bg-white shadow-[0_16px_40px_rgba(16,84,48,0.08)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_52px_rgba(16,84,48,0.14)]">
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
          alt={`${destination.city}, ${destination.country}`}
          fill
          sizes="(max-width: 768px) 100vw, 33vw"
          className="object-cover transition duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,26,15,0.08)_0%,rgba(8,26,15,0.5)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 p-4 text-white">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200">{destination.country}</p>
          <h3 className="mt-2 font-display text-3xl leading-none">{destination.city}</h3>
          <span className="mt-4 inline-flex rounded-full bg-white/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white">
            {copy.openGuide}
          </span>
        </div>
      </LocalizedLink>

      <div className="p-5">
        <p className="line-clamp-3 text-sm leading-7 text-emerald-900/78">{summary}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-900">
            {copy.flight} {destination.typicalFlightHoursFromPL.toFixed(1)} h
          </span>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-900">
            {copy.style} {destination.beachScore >= 0.7 ? copy.beach : copy.city}
          </span>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-900">
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
            className="rounded-full bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800"
          >
            {copy.showDestination}
          </LocalizedLink>
          <LocalizedLink
            href={`/planner?mode=standard&q=${encodeURIComponent(destination.city)}`}
            locale={locale}
            onClick={() =>
              sendClientEvent("destination_card_clicked", {
                slug: destination.slug,
                city: destination.city,
                action: "planner",
                source,
                locale,
              })
            }
            className="rounded-full border border-emerald-900/10 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-50"
          >
            {copy.planner}
          </LocalizedLink>
        </div>
      </div>
    </article>
  );
}

