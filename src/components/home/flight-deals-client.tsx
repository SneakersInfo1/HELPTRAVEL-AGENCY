"use client";

// Klienckie części sekcji „Okazje lotnicze": wyłącznie pomiar. Karty renderuje
// serwer — do przeglądarki nie jedzie ani budowanie linków, ani formatowanie
// cen, ani nazwy miast.
//
// Wzorzec 1:1 z theme-tiles-client (siatka + obwoluta klikowa), a nie
// z destination-carousel: ta sekcja jest SIATKĄ, nie pasem przewijanym, więc
// nie ma tu czego przewijać ani mierzyć w Embli.

import { useCallback, useRef, type ReactNode } from "react";

import { track } from "@/lib/analytics/track";
import { useViewOnce } from "@/lib/analytics/use-view-once";
import { COPY_VARIANT } from "@/lib/home/copy";

/** Pozycja listy okazji w schemacie ecommerce GA4. */
export interface FlightDealItem {
  /** Klucz trasy (`WAW-BCN`) — zarazem `item_id`. */
  routeKey: string;
  /** Miasto docelowe po polsku. */
  cityLabel: string;
  /** Kraj po polsku — `item_category`, żeby dało się grupować po kierunkach. */
  countryLabel: string;
  pricePln: number;
  savingPercent: number;
}

const LIST_ID = "home_flight_deals";
const LIST_NAME = "Okazje lotnicze";

function toGa4Item(item: FlightDealItem, index: number) {
  return {
    item_id: item.routeKey,
    item_name: item.cityLabel,
    item_category: item.countryLabel,
    // Cena JEST za osobę (cron szuka dla jednego dorosłego), więc pole
    // `price` w schemacie ecommerce znaczy dokładnie to, co powinno —
    // inaczej niż w pasie hoteli, gdzie liczba dotyczy pokoju dla dwojga
    // i dlatego świadomie tam nie jedzie.
    price: item.pricePln,
    currency: "PLN" as const,
    index: index + 1,
  };
}

/** Siatka okazji z pomiarem ekspozycji (`view_item_list`). */
export function FlightDealsGrid({
  items,
  children,
  className,
}: {
  items: FlightDealItem[];
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
        items: items.map(toGa4Item),
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

/** Przezroczysta obwoluta: łapie klik w kartę i raportuje pozycję. */
export function TrackedDeal({
  item,
  position,
  children,
}: {
  item: FlightDealItem;
  position: number;
  children: ReactNode;
}) {
  return (
    <div
      className="contents"
      onClickCapture={() => {
        track("flight_deal_card_clicked", {
          slug: item.routeKey,
          position,
          price_per_person: item.pricePln,
          // Bez tego pola nie da się odpowiedzieć na jedyne pytanie, które
          // ta sekcja realnie stawia: czy WIELKOŚĆ rabatu przekłada się na
          // kliknięcia, czy ludzie klikają po prostu w tanie kierunki.
          saving_percent: item.savingPercent,
        });
        track("select_item", {
          item_list_id: LIST_ID,
          item_list_name: LIST_NAME,
          items: [toGa4Item(item, position - 1)],
          copy_variant: COPY_VARIANT,
        });
      }}
    >
      {children}
    </div>
  );
}
