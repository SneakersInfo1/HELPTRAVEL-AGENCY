// Sekcja udogodnień — warstwa domenowa (deduplikacja pojęciowa) + ikony SVG.
//
// Zastępuje `groupFacilities` z lib/liteapi/facilities.ts w TYM widoku.
// Dwie rzeczy, które tamten moduł robił gorzej:
//   1. deduplikował po zlokalizowanej etykiecie, więc duplikaty ze ŹRÓDŁA
//      (facilityId 47 „WiFi dostępne" + 107 „Darmowe WiFi") przechodziły jako
//      dwa wpisy — to była skarga właściciela wprost,
//   2. używał EMOJI jako ikon kategorii (📶, 🚗, ✓), czego brief §14.3 zakazuje.
//
// Stary moduł zostaje nietknięty — korzystają z niego inne widoki.

import { createElement } from "react";
import {
  Accessibility,
  Baby,
  BedDouble,
  Check,
  CigaretteOff,
  Clock,
  ConciergeBell,
  CookingPot,
  Croissant,
  Dumbbell,
  Flower2,
  Lock,
  Martini,
  MoveVertical,
  PawPrint,
  PlaneTakeoff,
  Presentation,
  CircleParking,
  Snowflake,
  Thermometer,
  TreePalm,
  Trees,
  Tv,
  Umbrella,
  UtensilsCrossed,
  Users,
  WashingMachine,
  Waves,
  Wifi,
  type LucideIcon,
} from "lucide-react";

import { CATEGORY_LABELS, groupAmenities, iconForAmenity, normalizeAmenities } from "@/lib/hotels/domain/amenity";
import type { Amenity } from "@/lib/hotels/domain/types";

// Import SELEKTYWNY (07-decisions.md R1) — nigdy `import * as icons`, bo to
// wciągnęłoby całą bibliotekę do paczki klienta.
const ICONS: Record<string, LucideIcon> = {
  Wifi,
  CircleParking,
  PlaneTakeoff,
  Waves,
  Flower2,
  Dumbbell,
  UtensilsCrossed,
  Martini,
  Croissant,
  ConciergeBell,
  Clock,
  Snowflake,
  Thermometer,
  Tv,
  CookingPot,
  WashingMachine,
  CigaretteOff,
  Users,
  Baby,
  PawPrint,
  Accessibility,
  MoveVertical,
  TreePalm,
  Trees,
  Umbrella,
  Lock,
  Presentation,
  BedDouble,
};

function AmenityIcon({ amenity }: { amenity: Amenity }) {
  const name = iconForAmenity(amenity);
  // Wpis nierozpoznany dostaje neutralny „check", nie przypadkowy symbol
  // (brief §14.3). Nie udajemy, że wiemy, czego dotyczy.
  //
  // `createElement` zamiast `<Icon />`: przypisanie komponentu do zmiennej
  // z wielkiej litery i renderowanie jej w JSX wygląda dla React Compilera
  // jak TWORZENIE komponentu w trakcie renderu (błąd lintu). Tu tylko
  // WYBIERAMY jeden z modułowej mapy, więc jawne createElement jest uczciwsze.
  return createElement(ICONS[name ?? ""] ?? Check, {
    "aria-hidden": true,
    className: "mt-0.5 h-4 w-4 shrink-0 text-emerald-600",
  });
}

export function AmenitiesSection({ sources }: { sources: (unknown[] | null | undefined)[] }) {
  const amenities = normalizeAmenities(...sources);
  if (!amenities.length) return null;
  const groups = groupAmenities(amenities);

  return (
    <section id="amenities" className="rounded-2xl bg-white p-6 ring-1 ring-neutral-200">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-neutral-900">Udogodnienia</h2>
        <p className="text-xs text-neutral-500">{amenities.length} potwierdzonych przez obiekt</p>
      </div>

      <div className="mt-4 space-y-5">
        {groups.map((group) => (
          <div key={group.category}>
            <h3 className="text-sm font-semibold text-neutral-800">{CATEGORY_LABELS[group.category]}</h3>
            <ul className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm text-neutral-700 sm:grid-cols-2 lg:grid-cols-3">
              {group.items.map((item) => (
                <li key={`${item.category}:${item.label}`} className="flex items-start gap-2">
                  <AmenityIcon amenity={item} />
                  <span>{item.label}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
