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
 * Ile sekcji musi być widoczne, żeby uznać ją za obejrzaną. 0,25 — pas kart
 * jest wysoki, więc „w polu widzenia" ma znaczyć „widać kilka kart", a nie
 * „wjechał górny piksel". Obie sekcje strony głównej są niższe niż ekran
 * 375×812, więc ten próg jest osiągalny na każdym urządzeniu docelowym.
 */
const VIEW_THRESHOLD = 0.25;

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
  // Ref, nie stan: „ekspozycja już zaraportowana" nie wpływa na render, a jako
  // stan wywołałaby przerysowanie całego pasa w momencie przewinięcia do niego.
  const viewSentRef = useRef(false);

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

  // EKSPOZYCJA sekcji. Bez tego znamy tylko licznik kliknięć, więc sekcja
  // z niskim CTR jest nie do odróżnienia od sekcji, do której nikt nie doscrollował
  // — a to dwa zupełnie różne wnioski (popraw kartę vs przenieś sekcję wyżej).
  useEffect(() => {
    const el = rootRef.current;
    if (!el || !listId || viewSentRef.current) return;
    // Bez IntersectionObserver (stare WebView) po prostu nie raportujemy
    // ekspozycji. Analityka nigdy nie może wywrócić strony.
    if (typeof IntersectionObserver === "undefined") return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          // Warunkiem jest RATIO, nie `isIntersecting`. Obserwator dostarcza
          // pierwszy wpis od razu po `observe()`, niezależnie od progu, a
          // `isIntersecting` jest prawdziwe przy JAKIMKOLWIEK przecięciu. Pas
          // „Popularne kierunki" zaczyna się na 375×812 poniżej zgięcia, ale
          // jego górna krawędź wchodzi w ekran już przy scrollu 0 — na samym
          // `isIntersecting` sekcja raportowałaby ekspozycję każdemu, kto
          // otworzył stronę i nic nie zrobił. To zawyżałoby wyświetlenia
          // i zaniżało CTR, czyli odwrotnie do celu tego pomiaru.
          if (entry.intersectionRatio < VIEW_THRESHOLD || viewSentRef.current) continue;
          viewSentRef.current = true;
          io.disconnect();
          track("view_item_list", {
            item_list_id: listId,
            item_list_name: listName ?? listId,
            items: toGa4Items(items),
          });
        }
      },
      { threshold: VIEW_THRESHOLD },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [items, listId, listName]);

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
