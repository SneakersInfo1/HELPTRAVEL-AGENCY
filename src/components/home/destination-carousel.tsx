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

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { track } from "@/lib/analytics/track";
import { useViewOnce } from "@/lib/analytics/use-view-once";
import { COPY_VARIANT } from "@/lib/home/copy";
import { cn } from "@/lib/ui/cn";

export interface CarouselItem {
  /** Slug kierunku — trafia do eventu GA4. */
  slug: string;
  /** Cena/os. jeśli znana (do eventu; sama karta renderuje ją sobie). */
  pricePerPerson?: number;
  /**
   * Który event GA4 wysłać. Kafelek kierunku i karta pakietu to dwa różne
   * produkty w lejku — wrzucenie ich pod jeden event skasowałoby możliwość
   * porównania, który realnie sprzedaje.
   */
  kind?: "destination" | "package";
  /** Nazwa pozycji w GA4 (miasto po polsku). */
  name?: string;
  /** Kategoria pozycji w GA4 (kraj po polsku). */
  category?: string;
  node: ReactNode;
}

/**
 * Pozycje w schemacie ecommerce GA4. `index` jest 1-based, żeby zgadzał się
 * z `position` w starszych eventach — inaczej te same kliknięcia miałyby
 * w raportach dwie różne numeracje.
 */
function toGa4Item(item: CarouselItem, index: number) {
  return {
    item_id: item.slug,
    item_name: item.name ?? item.slug,
    item_category: item.category,
    price: item.pricePerPerson,
    currency: typeof item.pricePerPerson === "number" ? ("PLN" as const) : undefined,
    index: index + 1,
  };
}

function toGa4Items(items: CarouselItem[]) {
  return items.map(toGa4Item);
}

export function DestinationCarousel({
  items,
  header,
  aside,
  tone = "dark",
  slideClassName = "min-w-0 shrink-0 basis-[42%] pl-3 sm:basis-[30%] sm:pl-4 md:basis-[22%] lg:basis-[18%] xl:basis-[14.5%]",
  ariaLabel,
  listId,
  listName,
}: {
  items: CarouselItem[];
  /** Lewa strona wiersza nagłówka (nadtytuł pasa albo <h2> sekcji). */
  header: ReactNode;
  /** Prawa strona wiersza, PRZED strzałkami — np. dopisek „Loty z Warszawy". */
  aside?: ReactNode;
  /** Paleta strzałek: ciemny pas hero vs jasne tło strony. */
  tone?: "dark" | "light";
  /** Szerokości slajdu (pakiety mają większe karty niż kafelki kierunków). */
  slideClassName?: string;
  /** Etykieta strzałek — na stronie są dwie karuzele, muszą się różnić. */
  ariaLabel?: { prev: string; next: string };
  /**
   * Identyfikator listy w schemacie ecommerce GA4 (`home_inspire`,
   * `home_packages`). Podany → pas raportuje `view_item_list` przy wejściu
   * w pole widzenia i `select_item` przy kliku. Prymitywy, a nie obiekt,
   * bo obiekt literałowy z rodzica zmieniałby tożsamość co render i restartował
   * obserwatora.
   */
  listId?: string;
  listName?: string;
}) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: "start",
    containScroll: "trimSnaps",
    dragFree: true,
    skipSnaps: false,
  });
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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

  // Ekspozycja pasa — wspólny hak, żeby pułapka `isIntersecting` vs
  // `intersectionRatio` była opisana i pilnowana w jednym miejscu.
  useViewOnce(
    rootRef,
    useCallback(() => {
      if (!listId) return;
      track("view_item_list", {
        item_list_id: listId,
        item_list_name: listName ?? listId,
        items: toGa4Items(items),
        copy_variant: COPY_VARIANT,
      });
    }, [items, listId, listName]),
    Boolean(listId),
  );

  return (
    <div ref={rootRef}>
      {/* Nagłówek pasa renderuje KARUZELA, nie strona. Wcześniej tytuł i
          dopisek żyły w home-hybrid-hero, a strzałki wisiały nad nimi jako
          `absolute -top-11 right-0` — czyli dwa niezależnie pozycjonowane
          elementy walczyły o ten sam prawy górny róg i strzałki wchodziły na
          napis „Loty z Warszawy · ceny w PLN" (zgłoszenie właściciela ze
          zrzutu). Teraz to JEDEN wiersz flex: tytuł, dopisek i strzałki są
          rodzeństwem, więc nachodzenie jest niemożliwe konstrukcyjnie, a nie
          „dobrane offsetem". */}
      <div className="mb-4 flex items-end justify-between gap-x-6 gap-y-1">
        {header}
        <div className="flex items-end gap-3">
          {aside}
          {/* Strzałki: desktop only — na mobile swipe jest naturalniejszy, a
              przyciski zabierałyby szerokość kart. */}
          <div className="hidden shrink-0 gap-1.5 sm:flex">
            <ArrowButton
              direction="prev"
              tone={tone}
              label={ariaLabel?.prev ?? "Poprzednie kierunki"}
              disabled={!canPrev}
              onClick={() => emblaApi?.scrollPrev()}
            />
            <ArrowButton
              direction="next"
              tone={tone}
              label={ariaLabel?.next ?? "Następne kierunki"}
              disabled={!canNext}
              onClick={() => emblaApi?.scrollNext()}
            />
          </div>
        </div>
      </div>

      <div className="overflow-hidden" ref={emblaRef}>
        <div className="-ml-3 flex sm:-ml-4">
          {items.map((item, index) => (
            <div
              key={item.slug}
              className={slideClassName}
              onClickCapture={() => {
                track(
                  item.kind === "package" ? "package_card_clicked" : "destination_card_clicked",
                  {
                    slug: item.slug,
                    position: index + 1,
                    price_per_person: item.pricePerPerson,
                  },
                );
                // Stary event ZOSTAJE obok nowego: raporty GA4 zbudowane na
                // `*_card_clicked` mają ciągłość, a `select_item` domyka lejek
                // ekspozycja → klik w standardowym schemacie ecommerce.
                if (listId) {
                  track("select_item", {
                    item_list_id: listId,
                    item_list_name: listName ?? listId,
                    items: [toGa4Item(item, index)],
                    copy_variant: COPY_VARIANT,
                  });
                }
              }}
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
  tone,
  label,
}: {
  direction: "prev" | "next";
  disabled: boolean;
  onClick: () => void;
  tone: "dark" | "light";
  label: string;
}) {
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-full border transition",
        tone === "dark"
          ? disabled
            ? "cursor-not-allowed border-white/15 text-white/30"
            : "border-white/30 text-white hover:border-white/60 hover:bg-white/10"
          : disabled
            ? "cursor-not-allowed border-line text-ink-muted/40"
            : "border-line bg-surface-raised text-ink hover:border-brand/40 hover:bg-brand-soft",
      )}
    >
      <Icon aria-hidden className="h-4 w-4" strokeWidth={2} />
    </button>
  );
}
