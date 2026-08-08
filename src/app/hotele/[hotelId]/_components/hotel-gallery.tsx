"use client";

// Galeria hotelu — KOLAŻ na desktopie, karuzela na telefonie (brief §8).
//
// Co było źle w wersji poprzedniej i dlaczego to nie był tylko wygląd:
//
// 1. Jedna scena na całą szerokość + pasek miniatur. Scena miała 1184×560 px,
//    a plik źródłowy Cupida dla tego hotelu ma 1280×960 (zmierzone). Przy DPR 2
//    przeglądarka chciała 2368 px i dostawała 1280 → 1,85× powiększenia.
//    To jest ta „gorsza jakość zdjęć": nie kompresja, tylko rozciąganie.
//    Kolaż daje głównemu kadrowi ~880 px zamiast 1184 → mniej rozciągania,
//    a cztery małe kafle (~436 px) są ostre nawet na najsłabszym źródle.
//
// 2. `photos.map()` wstawiał do DOM WSZYSTKIE zdjęcia jako <Image fill> —
//    dla hotelu ze 140 zdjęciami (zmierzone: lp1897) to 140 elementów plus
//    drugie tyle w pasku miniatur. Teraz w DOM jest 5 kafli; reszta wchodzi
//    dopiero z lightboxem (brief §9: „nie powielaj całego ciężkiego zestawu").
//
// Sprawdzone empirycznie i NIE do naprawienia po naszej stronie:
// `hotelImages[].urlHd === url` w 100% wpisów (4 hotele), a renditiony po
// ścieżce nie istnieją (`/hotels/1920x1080/…` → 404). Lepszego pliku po prostu
// nie ma — jedyne, co możemy zrobić, to przestać go rozciągać.

import Image from "next/image";
import { Expand } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { GalleryLightbox } from "./gallery-lightbox";

/** Ile kafli pokazuje kolaż. Piąty nosi przycisk „pokaż wszystkie". */
const COLLAGE_TILES = 5;

/**
 * `sizes` liczone z realnej geometrii, nie „na oko".
 * Powłoka strony hotelu: min(1760, 100vw − 80). Duży kafel = ~połowa tego.
 */
const SIZES_MAIN = "(max-width: 1023px) 100vw, (max-width: 1839px) 46vw, 872px";
const SIZES_TILE = "(max-width: 1023px) 50vw, (max-width: 1839px) 23vw, 432px";

export function HotelGallery({ photos, alt }: { photos: string[]; alt: string }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [startIndex, setStartIndex] = useState(0);
  const n = photos.length;

  const openAt = useCallback((i: number) => {
    setStartIndex(i);
    setLightboxOpen(true);
  }, []);

  if (n === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl bg-neutral-200 text-neutral-500">
        Brak zdjęć
      </div>
    );
  }

  const tiles = photos.slice(0, COLLAGE_TILES);

  return (
    <>
      {/* ── TELEFON / TABLET: karuzela ─────────────────────────────────────
          Kolaż na wąskim ekranie daje pięć znaczków pocztowych — brief §8
          wprost każe zostawić tu duży kadr z przesuwaniem palcem. */}
      <MobileCarousel photos={photos} alt={alt} onOpen={openAt} />

      {/* ── DESKTOP: kolaż ─────────────────────────────────────────────────
          Wysokość rośnie schodkowo, bo przy `lg` treść ma ~950 px i duży kafel
          zrobiłby się pionowym paskiem. */}
      <div className="hidden lg:grid lg:h-[440px] lg:grid-cols-4 lg:grid-rows-2 lg:gap-2 xl:h-[520px]">
        {tiles.map((src, i) => {
          const isMain = i === 0;
          const isLast = i === tiles.length - 1;
          return (
            <button
              key={src + i}
              type="button"
              onClick={() => openAt(i)}
              aria-label={`Powiększ zdjęcie ${i + 1} z ${n}`}
              className={[
                "group relative overflow-hidden bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500",
                isMain ? "col-span-2 row-span-2 rounded-l-2xl" : "",
                // Zaokrąglone są WYŁĄCZNIE narożniki całego kolażu; środek
                // zostaje ciągły, inaczej wygląda jak cztery przypadkowe kartki.
                i === 2 ? "rounded-tr-2xl" : "",
                i === 4 ? "rounded-br-2xl" : "",
                // Zdjęć bywa mniej niż 5 — wtedy ostatni kafel domyka prawą
                // krawędź sam, żeby kolaż nie kończył się ostrym rogiem.
                isLast && i > 0 ? "rounded-r-2xl" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <Image
                src={src}
                alt={isMain ? alt : ""}
                fill
                priority={isMain}
                fetchPriority={isMain ? "high" : undefined}
                loading={isMain ? undefined : "lazy"}
                sizes={isMain ? SIZES_MAIN : SIZES_TILE}
                className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
              />
              {/* Ciemniejsze tło pod przyciskiem, żeby napis był czytelny
                  niezależnie od tego, co jest na zdjęciu. */}
              {isLast && (
                <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
              )}
            </button>
          );
        })}
      </div>

      {/* Pasek pod kolażem: liczba zdjęć + wejście w pełny ekran.
          Osobno, a nie „na piątym kaflu", bo przycisk wewnątrz przycisku to
          nieprawidłowy HTML i pułapka dla czytników ekranu. */}
      <div className="hidden lg:mt-2 lg:flex lg:items-center lg:justify-between">
        <p className="text-xs text-neutral-500">
          {n === 1 ? "1 zdjęcie obiektu" : `${n} ${zdjeciaWord(n)} obiektu`}
        </p>
        <button
          type="button"
          onClick={() => openAt(0)}
          className="inline-flex h-10 items-center gap-1.5 rounded-full border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:border-emerald-400 hover:text-emerald-800"
        >
          <Expand aria-hidden className="h-4 w-4" />
          Pokaż wszystkie zdjęcia ({n})
        </button>
      </div>

      {/* `key` wymusza REMONT przy każdym otwarciu — lightbox startuje od
          klikniętego kadru bez synchronizacji stanu efektem. */}
      <GalleryLightbox
        key={lightboxOpen ? `lb-${startIndex}` : "lb-closed"}
        photos={photos}
        alt={alt}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        startIndex={startIndex}
      />
    </>
  );
}

/** „2 zdjęcia", „5 zdjęć" — polska odmiana. */
function zdjeciaWord(n: number): string {
  const last = n % 10;
  const twoLast = n % 100;
  if (last >= 2 && last <= 4 && !(twoLast >= 12 && twoLast <= 14)) return "zdjęcia";
  return "zdjęć";
}

/**
 * Karuzela na telefon — natywne przewijanie z zatrzaskiem (CSS scroll-snap).
 *
 * Świadomie bez biblioteki: `overflow-x-auto` + `snap-x mandatory` daje
 * przesuwanie palcem, bezwładność i zachowanie systemowe za zero kilobajtów.
 * Do DOM trafia okno ±1 kadru wokół aktywnego, więc hotel ze 140 zdjęciami
 * nie ładuje 140 elementów.
 */
function MobileCarousel({
  photos,
  alt,
  onOpen,
}: {
  photos: string[];
  alt: string;
  onOpen: (i: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);
  const n = photos.length;

  // Aktywny kadr liczony z pozycji przewinięcia. `passive` — nie blokujemy
  // gestu; `requestAnimationFrame` gasi lawinę zdarzeń przy szybkim swipie.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
        setActive((prev) => (prev === i ? prev : Math.min(n - 1, Math.max(0, i))));
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [n]);

  return (
    <div className="relative lg:hidden">
      <div
        ref={trackRef}
        className="flex h-[260px] snap-x snap-mandatory overflow-x-auto rounded-2xl sm:h-[360px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {photos.map((src, i) => (
          <button
            key={src + i}
            type="button"
            onClick={() => onOpen(i)}
            aria-label={`Powiększ zdjęcie ${i + 1} z ${n}`}
            className="relative h-full w-full flex-none snap-center bg-neutral-100"
          >
            {/* Okno ±1: sąsiednie kadry są gotowe zanim palec dojedzie,
                a dalsze nie istnieją w DOM. */}
            {Math.abs(i - active) <= 1 ? (
              <Image
                src={src}
                alt={i === 0 ? alt : ""}
                fill
                priority={i === 0}
                fetchPriority={i === 0 ? "high" : undefined}
                loading={i === 0 ? undefined : "lazy"}
                sizes="100vw"
                className="object-cover"
              />
            ) : null}
          </button>
        ))}
      </div>

      <div className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white tabular-nums">
        {active + 1} / {n}
      </div>

      <button
        type="button"
        onClick={() => onOpen(active)}
        className="absolute bottom-3 right-3 inline-flex h-10 items-center gap-1.5 rounded-full bg-white/95 px-4 text-sm font-semibold text-neutral-900 shadow-sm"
      >
        <Expand aria-hidden className="h-4 w-4" />
        Wszystkie ({n})
      </button>
    </div>
  );
}
