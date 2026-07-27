"use client";

// Klienckie części sekcji „Nie wiesz, dokąd jechać?": kafel konsjerża oraz
// pomiar klików w kafle kategorii. Sama sekcja zostaje serwerowa — do
// przeglądarki jedzie tylko to, co naprawdę potrzebuje interaktywności.

import { useCallback, useRef, type ReactNode } from "react";
// Compass, nie ikona czatu: ta sama ikona co zakładka w hero i dymek
// launchera — trzy wejścia do jednego produktu mają wyglądać jak jeden produkt.
import { Compass } from "lucide-react";

import { track } from "@/lib/analytics/track";
import { useViewOnce } from "@/lib/analytics/use-view-once";
import { COPY_VARIANT } from "@/lib/home/copy";
import { requestConciergeOpen } from "@/lib/concierge/open-event";

/** Pozycja listy kafli w schemacie ecommerce GA4. */
export interface ThemeGridItem {
  slug: string;
  label: string;
  fromPerPersonPln?: number;
}

const LIST_ID = "home_themes";
const LIST_NAME = "Kafle klimatów";

/**
 * Siatka kafli klimatów z pomiarem ekspozycji.
 *
 * Ten sam `item_list_id`/`view_item_list` co pasy A i B — dzięki temu trzy
 * ścieżki wyboru kierunku (inspiracja, pakiety, klimaty) da się porównać
 * w JEDNYM raporcie GA4 zamiast zestawiać trzy różne metryki i zgadywać.
 */
export function ThemeGrid({
  items,
  children,
  className,
}: {
  items: ThemeGridItem[];
  children: ReactNode;
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useViewOnce(
    rootRef,
    useCallback(() => {
      track("view_item_list", {
        item_list_id: LIST_ID,
        item_list_name: LIST_NAME,
        items: items.map((item, index) => ({
          item_id: item.slug,
          item_name: item.label,
          price: item.fromPerPersonPln,
          currency: typeof item.fromPerPersonPln === "number" ? ("PLN" as const) : undefined,
          index: index + 1,
        })),
        copy_variant: COPY_VARIANT,
      });
    }, [items]),
  );

  return (
    <div ref={rootRef} className={className}>
      {children}
    </div>
  );
}

/** Przezroczysta obwoluta: łapie klik w kafel kategorii i raportuje pozycję. */
export function TrackedTile({
  slug,
  position,
  label,
  fromPerPersonPln,
  children,
}: {
  slug: string;
  position: number;
  label: string;
  fromPerPersonPln?: number;
  children: ReactNode;
}) {
  return (
    <div
      className="contents"
      onClickCapture={() => {
        // Stary event zostaje — raporty na `category_tile_clicked` mają
        // ciągłość; `select_item` domyka lejek w tym samym schemacie, w którym
        // mierzone są dwie sekcje wyżej.
        track("category_tile_clicked", { slug, position });
        track("select_item", {
          item_list_id: LIST_ID,
          item_list_name: LIST_NAME,
          items: [
            {
              item_id: slug,
              item_name: label,
              price: fromPerPersonPln,
              currency: typeof fromPerPersonPln === "number" ? ("PLN" as const) : undefined,
              index: position,
            },
          ],
          copy_variant: COPY_VARIANT,
        });
      }}
    >
      {children}
    </div>
  );
}

/**
 * Drugie wejście do konsjerża — RÓWNORZĘDNY kafel w tej samej siatce, nie
 * baner. Użytkownik, który nie wie dokąd jechać, dostaje tu ścieżkę „powiedz
 * budżet" zamiast kolejnej kategorii do zgadywania.
 *
 * Kafel nie ma zdjęcia (celowo): w siatce fotografii jednolita, ciemna
 * powierzchnia marki czyta się jako inny RODZAJ akcji, a nie kolejny kierunek.
 */
export function AssistantTile() {
  return (
    <button
      type="button"
      onClick={() => requestConciergeOpen("category_tile")}
      className="group relative flex aspect-[4/3] flex-col justify-end overflow-hidden rounded-2xl border border-brand-strong/20 bg-brand-strong p-3 text-left text-white transition duration-200 ease-out hover:-translate-y-1 hover:shadow-lg active:scale-[0.99] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100 sm:p-4"
    >
      <Compass
        aria-hidden
        strokeWidth={1.5}
        className="absolute right-3 top-3 h-8 w-8 text-white/25 transition duration-200 ease-out group-hover:text-white/40 motion-reduce:transition-none"
      />
      {/* Kafel mówił „Powiedz budżet — dobiorę wyjazd", czyli DOKŁADNIE to, co
          od fazy 3a robi dobieracz stojący dwa centymetry wyżej. Dwa sąsiednie
          wejścia z tą samą obietnicą to nie wybór, tylko wahanie — użytkownik
          musi zgadnąć, czym się różnią.
          Asystent umie jedno, czego dwa chipy nie umieją: przyjąć warunki
          podane własnymi słowami (konkretne daty, dziecko, limit długości
          lotu). Kafel mówi teraz o tym. */}
      <h4 className="font-display text-lg leading-tight sm:text-xl">
        Opisz wyjazd własnymi słowami
      </h4>
      <p className="mt-0.5 hidden text-xs text-white/75 sm:block">
        Daty, dzieci, długość lotu — asystent to uwzględni
      </p>
      <p className="mt-1 text-xs font-semibold text-white/90">
        Otwórz asystenta <span aria-hidden>→</span>
      </p>
    </button>
  );
}
