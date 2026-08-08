"use client";

// Podgląd mapy nad filtrami (brief V3 §4).
//
// Rola: pokazać, ŻE mapa istnieje, i dać do niej jedno kliknięcie — a nie
// odtworzyć mapę w miniaturze. Stąd statyczny obraz z `/api/map/static`,
// a nie druga instancja MapLibre: podgląd stoi na każdym wyszukiwaniu, także
// u gościa, który mapy nigdy nie otworzy, i nie może opóźnić pierwszych
// wyników ani o kilobajt JavaScriptu.
//
// Środek bierzemy z MEDIANY współrzędnych puli (patrz `filter-options-store`).
// Zanim pula dojdzie, komponent nie renderuje NIC — pusty prostokąt z napisem
// „ładowanie" w miejscu, gdzie za chwilę pojawią się filtry, tylko przeszkadza.

import Image from "next/image";
import { Map as MapIcon } from "lucide-react";
import { useSyncExternalStore } from "react";

import {
  getFilterOptions,
  getServerFilterOptions,
  subscribeFilterOptions,
} from "@/lib/hotels/filter-options-store";
import { setViewMode } from "@/lib/hotels/view-mode-store";

export function MiniMapPreview({ onOpen }: { onOpen?: () => void }) {
  const { center, poolSize } = useSyncExternalStore(
    subscribeFilterOptions,
    getFilterOptions,
    getServerFilterOptions,
  );

  if (!center) return null;

  // Rozmiar obrazu z zapasem na ekrany o wysokiej gęstości pikseli; kafel
  // wyświetla się w ~300×176 px, więc 600×352 pokrywa DPR 2.
  const src = `/api/map/static?lat=${center.lat.toFixed(4)}&lng=${center.lng.toFixed(4)}&w=600&h=352&zoom=11`;

  return (
    <button
      type="button"
      onClick={() => {
        onOpen?.();
        setViewMode("map");
      }}
      className="group relative block aspect-[600/352] w-full overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
      aria-label={`Pokaż na mapie ${poolSize > 0 ? `(${poolSize} obiektów)` : ""}`.trim()}
    >
      <Image
        src={src}
        alt=""
        fill
        sizes="(max-width: 1023px) 92vw, 320px"
        className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        // Podgląd jest dodatkiem — nigdy nie konkuruje o pasmo ze zdjęciami
        // hoteli, które gość faktycznie ogląda.
        loading="lazy"
      />
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 to-transparent" />
      <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center pb-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-neutral-900 shadow-md transition group-hover:bg-emerald-50 group-hover:text-emerald-800">
          <MapIcon aria-hidden className="h-4 w-4" />
          Pokaż na mapie
        </span>
      </span>
    </button>
  );
}
