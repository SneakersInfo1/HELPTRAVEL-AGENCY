"use client";

// Pasek szybkich filtrów nad wynikami w trybie MAPY (brief V3 §6).
//
// W trybie mapy sidebar znika, bo trzy kolumny (filtry + lista + mapa)
// zgniatały karty hoteli. Najczęściej używane filtry muszą wtedy zostać
// w zasięgu ręki — stąd ten pasek.
//
// Chipy sterują TYMI SAMYMI parametrami URL co panel boczny, więc stan jest
// współdzielony: gość może zaznaczyć „Basen" na mapie, wrócić do listy
// i zobaczyć ten sam filtr zaznaczony w panelu. Żadnego drugiego źródła prawdy.

import { useRouter, useSearchParams } from "next/navigation";
import {
  Building2,
  CalendarCheck,
  CircleParking,
  Coffee,
  Dumbbell,
  Home,
  SlidersHorizontal,
  Star,
  Waves,
  type LucideIcon,
} from "lucide-react";
import { useCallback } from "react";

import { setViewMode } from "@/lib/hotels/view-mode-store";

/** Chip = para (parametr URL, wartość) + ikona. Filtry już istnieją. */
type Chip = { icon: LucideIcon } & (
  | { kind: "facility"; key: string; label: string }
  | { kind: "param"; param: string; value: string; label: string }
);

// PUŁAPKA NAPRAWIONA 2026-08-08: wartość „apartament" (po polsku) nie istnieje
// w `PROPERTY_TYPES` ani w `TYPE_ID_TO_CATEGORY` — chip „Apartamenty" ustawiał
// `propertyType=apartament`, a filtr porównywał to z kategorią `apartment`,
// więc ZAWSZE dawał zero wyników. Panel boczny używa „apartment" i to on ma
// rację; oba muszą mówić tym samym słownikiem, bo dzielą parametr URL.
const CHIPS: Chip[] = [
  { kind: "param", param: "minStars", value: "4", label: "4 gwiazdki i więcej", icon: Star },
  { kind: "param", param: "cancel", value: "free", label: "Bezpłatne anulowanie", icon: CalendarCheck },
  { kind: "facility", key: "parking", label: "Parking", icon: CircleParking },
  { kind: "facility", key: "breakfast", label: "Śniadanie", icon: Coffee },
  { kind: "facility", key: "pool", label: "Basen", icon: Waves },
  { kind: "facility", key: "gym", label: "Centrum fitness", icon: Dumbbell },
  { kind: "param", param: "propertyType", value: "hotel", label: "Hotele", icon: Building2 },
  { kind: "param", param: "propertyType", value: "apartment", label: "Apartamenty", icon: Home },
];

export function QuickFilters({ compact = false }: { compact?: boolean } = {}) {
  const router = useRouter();
  const sp = useSearchParams();

  const czyAktywny = useCallback(
    (chip: Chip): boolean => {
      if (chip.kind === "facility") {
        return (sp.get("facilities") ?? "").split(",").filter(Boolean).includes(chip.key);
      }
      const raw = sp.get(chip.param) ?? "";
      // `propertyType` jest listą; `minStars`/`cancel` pojedynczą wartością.
      return chip.param === "propertyType"
        ? raw.split(",").filter(Boolean).includes(chip.value)
        : raw === chip.value;
    },
    [sp],
  );

  const przelacz = useCallback(
    (chip: Chip) => {
      const next = new URLSearchParams(sp.toString());
      // Zmiana filtra zawsze wraca na pierwszą stronę — inaczej gość ląduje
      // na „stronie 7 z 3" i widzi pustkę.
      next.delete("strona");

      const listowy = chip.kind === "facility" ? "facilities" : chip.param;
      const wartosc = chip.kind === "facility" ? chip.key : chip.value;
      const wielokrotny = chip.kind === "facility" || chip.param === "propertyType";

      if (wielokrotny) {
        const obecne = (next.get(listowy) ?? "").split(",").filter(Boolean);
        const po = obecne.includes(wartosc)
          ? obecne.filter((v) => v !== wartosc)
          : [...obecne, wartosc];
        if (po.length) next.set(listowy, po.join(","));
        else next.delete(listowy);
      } else if (next.get(listowy) === wartosc) {
        next.delete(listowy);
      } else {
        next.set(listowy, wartosc);
      }

      // `replace`, NIE `push` — ujednolicone z panelem bocznym
      // (`filters-sidebar.tsx:191`, który zawsze robił `router.replace`).
      //
      // Zmierzone przed poprawką: każdy kliknięty chip dokładał wpis do
      // historii. Gość, który zaznaczył dwa filtry i wszedł w hotel, musiał
      // nacisnąć „Wstecz" trzy razy, żeby wyjść z wyników — a każde
      // naciśnięcie po drodze CICHO ZDEJMOWAŁO mu jeden filtr. Dla gościa
      // wyglądało to jak samoczynne rozjeżdżanie się filtrów.
      //
      // Zmiana filtra to korekta bieżącego widoku, nie nowa lokalizacja.
      // `scroll: false` — przewinięcie na górę wyrzuciłoby gościa z mapy.
      router.replace(`?${next.toString()}`, { scroll: false });
    },
    [router, sp],
  );

  return (
    <div className={compact ? "flex w-max items-center gap-2" : "flex flex-wrap items-center gap-2"}>
      <button
        type="button"
        // Powrót do listy odsłania pełny panel filtrów — to jedyne miejsce,
        // w którym mieszczą się wszystkie kryteria (cena, ocena, sieć, typ).
        onClick={() => setViewMode("list")}
        className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-emerald-700/30 bg-emerald-50 px-4 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
      >
        <SlidersHorizontal aria-hidden className="h-4 w-4" />
        Wszystkie filtry
      </button>

      {CHIPS.map((chip) => {
        const aktywny = czyAktywny(chip);
        const Icon = chip.icon;
        return (
          <button
            key={chip.kind === "facility" ? chip.key : `${chip.param}:${chip.value}`}
            type="button"
            onClick={() => przelacz(chip)}
            aria-pressed={aktywny}
            className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition ${
              aktywny
                ? "border-emerald-700 bg-emerald-700 text-white shadow-sm [&>svg]:text-white"
                : "border-neutral-300 bg-white text-neutral-700 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-800 [&>svg]:text-emerald-700/70"
            }`}
          >
            <Icon aria-hidden className="h-4 w-4" />
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
