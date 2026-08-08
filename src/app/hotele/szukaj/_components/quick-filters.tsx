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
import { SlidersHorizontal } from "lucide-react";
import { useCallback } from "react";

import { setViewMode } from "@/lib/hotels/view-mode-store";

/** Chip = para (parametr URL, wartość). Nic więcej — filtry już istnieją. */
type Chip =
  | { kind: "facility"; key: string; label: string }
  | { kind: "param"; param: string; value: string; label: string };

const CHIPS: Chip[] = [
  { kind: "param", param: "minStars", value: "4", label: "4 gwiazdki i więcej" },
  { kind: "param", param: "cancel", value: "free", label: "Bezpłatne anulowanie" },
  { kind: "facility", key: "parking", label: "Parking" },
  { kind: "facility", key: "breakfast", label: "Śniadanie" },
  { kind: "facility", key: "pool", label: "Basen" },
  { kind: "facility", key: "gym", label: "Centrum fitness" },
  { kind: "param", param: "propertyType", value: "hotel", label: "Hotele" },
  { kind: "param", param: "propertyType", value: "apartament", label: "Apartamenty" },
];

export function QuickFilters() {
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

      // `scroll: false` — przewinięcie na górę po kliknięciu chipa wyrzuciłoby
      // gościa z mapy, na którą właśnie patrzy.
      router.push(`?${next.toString()}`, { scroll: false });
    },
    [router, sp],
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        // Powrót do listy odsłania pełny panel filtrów — to jedyne miejsce,
        // w którym mieszczą się wszystkie kryteria (cena, ocena, sieć, typ).
        onClick={() => setViewMode("list")}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-800 transition hover:border-emerald-400 hover:text-emerald-800"
      >
        <SlidersHorizontal aria-hidden className="h-4 w-4" />
        Wszystkie filtry
      </button>

      {CHIPS.map((chip) => {
        const aktywny = czyAktywny(chip);
        return (
          <button
            key={chip.kind === "facility" ? chip.key : `${chip.param}:${chip.value}`}
            type="button"
            onClick={() => przelacz(chip)}
            aria-pressed={aktywny}
            className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition ${
              aktywny
                ? "border-emerald-700 bg-emerald-700 text-white"
                : "border-neutral-300 bg-white text-neutral-700 hover:border-emerald-400 hover:text-emerald-800"
            }`}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
