"use client";

// Karuzela „Popularne kierunki" — Embla zamiast natywnego scrolla.
//
// Dlaczego zmiana: poprzednia wersja to był `overflow-x-auto` z widocznym,
// szarym paskiem przewijania systemu. Pasek pod karuzelą wygląda jak
// niedokończony interfejs, a na desktopie nie dawał żadnej afordancji poza
// przeciąganiem. Embla daje snap, obsługę klawiatury i strzałki, a ucięta
// karta po prawej („peek") niesie sygnał „jest więcej" bez paska.
//
// Kafelek renderuje serwer (DestinationTile) — tutaj jest tylko powłoka
// przewijania i pomiar. Dzięki temu do przeglądarki nie jedzie logika
// budowania linków ani i18n miast.

import { useCallback, useEffect, useState, type ReactNode } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { track } from "@/lib/analytics/track";
import { cn } from "@/lib/ui/cn";

export interface CarouselItem {
  /** Slug kierunku — trafia do eventu GA4. */
  slug: string;
  /** Cena/os. jeśli znana (do eventu; sama karta renderuje ją sobie). */
  pricePerPerson?: number;
  node: ReactNode;
}

export function DestinationCarousel({ items }: { items: CarouselItem[] }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: "start",
    containScroll: "trimSnaps",
    dragFree: true,
    skipSnaps: false,
  });
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setCanPrev(emblaApi.canScrollPrev());
    setCanNext(emblaApi.canScrollNext());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    // Pierwszy odczyt odroczony (setTimeout 0): synchroniczny setState w ciele
    // efektu to kaskadowy render (react-hooks/set-state-in-effect z React
    // Compilera). Ten sam wzorzec co w home-search-tabs i webview-hint.
    const id = window.setTimeout(onSelect, 0);
    emblaApi.on("select", onSelect).on("reInit", onSelect);
    return () => {
      window.clearTimeout(id);
      emblaApi.off("select", onSelect).off("reInit", onSelect);
    };
  }, [emblaApi, onSelect]);

  return (
    <div className="relative">
      {/* Strzałki: desktop only — na mobile swipe jest naturalniejszy, a
          przyciski zabierałyby szerokość kart. */}
      <div className="pointer-events-none absolute -top-11 right-0 hidden gap-1.5 sm:flex">
        <ArrowButton
          direction="prev"
          disabled={!canPrev}
          onClick={() => emblaApi?.scrollPrev()}
        />
        <ArrowButton
          direction="next"
          disabled={!canNext}
          onClick={() => emblaApi?.scrollNext()}
        />
      </div>

      <div className="overflow-hidden" ref={emblaRef}>
        <div className="-ml-3 flex sm:-ml-4">
          {items.map((item, index) => (
            <div
              key={item.slug}
              className="min-w-0 shrink-0 basis-[42%] pl-3 sm:basis-[30%] sm:pl-4 md:basis-[22%] lg:basis-[18%] xl:basis-[14.5%]"
              onClickCapture={() =>
                track("destination_card_clicked", {
                  slug: item.slug,
                  position: index + 1,
                  price_per_person: item.pricePerPerson,
                })
              }
            >
              {item.node}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ArrowButton({
  direction,
  disabled,
  onClick,
}: {
  direction: "prev" | "next";
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === "prev" ? "Poprzednie kierunki" : "Następne kierunki"}
      className={cn(
        "pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-full border transition",
        disabled
          ? "cursor-not-allowed border-white/15 text-white/30"
          : "border-white/30 text-white hover:border-white/60 hover:bg-white/10",
      )}
    >
      <Icon aria-hidden className="h-4 w-4" strokeWidth={2} />
    </button>
  );
}
