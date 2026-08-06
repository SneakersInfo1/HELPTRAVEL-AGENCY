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

import { CATEGORY_LABELS, groupAmenities, iconForAmenity, normalizeAmenitiesWith } from "@/lib/hotels/domain/amenity";
import type { Amenity } from "@/lib/hotels/domain/types";
import { facilityLabelPl } from "@/lib/hotels/liteapi-reference";
import { stripCovidFacilities } from "@/lib/liteapi/covid-facilities";
import { sanitizeFacilities } from "@/lib/liteapi/sanitize-facilities";

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

export function AmenitiesSection({
  facilities,
  hotelFacilities,
  amenities: rawAmenities,
}: {
  /** `facilities[{facilityId,name}]` — kanoniczne, ma stabilne ID. */
  facilities?: unknown[] | null;
  /** Ta sama lista po angielsku, BEZ ID — tylko awaryjnie. */
  hotelFacilities?: unknown[] | null;
  /** Rzadko wypełniane pole `amenities` — też awaryjnie. */
  amenities?: unknown[] | null;
}) {
  // Kolejność źródeł ma znaczenie. `facilities[]` i `hotelFacilities[]` to TA
  // SAMA lista w dwóch reprezentacjach (zmierzone: po 34 pozycje na hotel),
  // ale tylko pierwsza ma `facilityId` → tylko dla niej znamy urzędową nazwę
  // polską. Łączenie obu dawało ogon nieprzetłumaczonych angielskich wpisów
  // („Public Bath", „Wine/champagne"), bo dedup po tekście nie zrówna
  // „Public Bath" z „Łaźnia publiczna".
  //
  // Dlatego: gdy `facilities[]` jest niepuste, używamy WYŁĄCZNIE jego.
  const withIds = Array.isArray(facilities) && facilities.length > 0;
  const sources: (unknown[] | null | undefined)[] = withIds
    ? [facilities]
    : [rawAmenities, hotelFacilities];

  // Ten komponent jest serwerowy (RSC), więc słownik referencyjny (~37 kB)
  // NIE trafia do paczki przeglądarki.
  const all = normalizeAmenitiesWith({ facilityLabel: facilityLabelPl }, ...sources);

  // Odsiew, który miała stara ścieżka i który trzeba zachować:
  //  • `sanitizeFacilities` — puste i przeczące wpisy („No pets"),
  //  • `stripCovidFacilities` — boilerplate pandemiczny („Hand sanitizer…"),
  //    który w 2026 roku jest szumem, a nie udogodnieniem.
  const allowed = new Set(stripCovidFacilities(sanitizeFacilities(all.map((a) => a.label))));
  const amenities = all.filter((a) => allowed.has(a.label));

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
