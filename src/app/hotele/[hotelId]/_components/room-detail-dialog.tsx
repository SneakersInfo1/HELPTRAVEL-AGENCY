"use client";

// Podgląd KONKRETNEGO pokoju (brief §11).
//
// Do tej pory karta pokoju pokazywała miniaturę, metraż i trzy udogodnienia,
// a kliknąć dało się wyłącznie „Wybierz" przy taryfie. Gość, który chciał
// zobaczyć, jak pokój wygląda i co w nim jest, nie miał gdzie kliknąć —
// przy wydatku rzędu kilku tysięcy złotych to poważny brak.
//
// Modal, nie osobna strona: wybór pokoju jest fragmentem jednej decyzji.
// Przeładowanie strony gubi kontekst (pozycję na liście pokoi, porównanie
// z sąsiednim wariantem) i kosztuje kolejne pobranie stawek.
//
// Radix Dialog daje focus trap, Escape, blokadę scrolla tła i `aria-modal`.
// Zdjęcia pokoju pochodzą z `rooms[].photos` powiązanych przez
// `rate.mappedRoomId` — NIGDY nie podstawiamy zdjęć budynku (decyzja R10).

import * as Dialog from "@radix-ui/react-dialog";
import Image from "next/image";
import { BedDouble, ChevronLeft, ChevronRight, ImageOff, Ruler, Users, X } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import type { RoomProfile } from "@/lib/hotels/domain/types";
import { guestsLabel } from "@/lib/hotels/domain/format";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Nazwa pokoju po polsku (grupa taryf), nie surowa nazwa dostawcy. */
  title: string;
  room: RoomProfile | null;
  /** Warianty taryf tego pokoju — te same wiersze, co na karcie. */
  options: ReactNode;
  /** Fallback, gdy dostawca nie powiązał pokoju: pojemność z taryfy. */
  fallbackMaxOccupancy?: number;
}

export function RoomDetailDialog({
  open,
  onOpenChange,
  title,
  room,
  options,
  fallbackMaxOccupancy,
}: Props) {
  const photos = room?.photos ?? [];
  const [index, setIndex] = useState(0);
  const n = photos.length;

  const prev = useCallback(() => setIndex((i) => (i - 1 + n) % n), [n]);
  const next = useCallback(() => setIndex((i) => (i + 1) % n), [n]);

  // Strzałki działają też tutaj — Escape obsługuje Radix.
  useEffect(() => {
    if (!open || n <= 1) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, n, prev, next]);

  const specs: { icon: typeof Ruler; text: string }[] = [];
  if (room?.sizeSquareMeters) specs.push({ icon: Ruler, text: `${room.sizeSquareMeters} m²` });
  const occupancy = room?.maxOccupancy ?? fallbackMaxOccupancy;
  if (occupancy) specs.push({ icon: Users, text: `do ${guestsLabel(occupancy)}` });
  const beds = (room?.beds ?? [])
    .map((b) => [b.quantity && b.quantity > 1 ? `${b.quantity}×` : null, b.type].filter(Boolean).join(" "))
    .filter(Boolean)
    .join(", ");
  if (beds) specs.push({ icon: BedDouble, text: beds });

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed inset-0 z-[80] flex flex-col bg-white focus:outline-none sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[90vh] sm:w-[min(1000px,94vw)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:shadow-2xl"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <header className="flex shrink-0 items-start justify-between gap-3 border-b border-neutral-200 px-4 py-3 sm:px-6">
            <div className="min-w-0">
              <Dialog.Title className="truncate text-lg font-bold text-neutral-900">
                Szczegóły pokoju
              </Dialog.Title>
              <p className="truncate text-sm text-neutral-600">{title}</p>
            </div>
            <Dialog.Close
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-neutral-600 transition hover:bg-neutral-100"
              aria-label="Zamknij szczegóły pokoju"
            >
              <X aria-hidden className="h-5 w-5" />
            </Dialog.Close>
          </header>
          <Dialog.Description className="sr-only">
            Zdjęcia, wyposażenie i dostępne warianty cenowe pokoju {title}.
          </Dialog.Description>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-6">
            {/* ── Zdjęcia TEGO pokoju ──────────────────────────────────── */}
            {n > 0 ? (
              <div className="relative h-56 overflow-hidden rounded-xl bg-neutral-100 sm:h-80">
                <Image
                  key={photos[index].url}
                  src={photos[index].url}
                  alt={photos[index].description?.trim() || `${title} — zdjęcie ${index + 1} z ${n}`}
                  fill
                  sizes="(max-width: 640px) 100vw, 940px"
                  className="object-cover"
                  priority
                />
                {n > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={prev}
                      aria-label="Poprzednie zdjęcie"
                      className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-neutral-800 shadow transition hover:bg-white"
                    >
                      <ChevronLeft aria-hidden className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={next}
                      aria-label="Następne zdjęcie"
                      className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-neutral-800 shadow transition hover:bg-white"
                    >
                      <ChevronRight aria-hidden className="h-5 w-5" />
                    </button>
                    <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white tabular-nums">
                      {index + 1} / {n}
                    </span>
                  </>
                )}
              </div>
            ) : (
              // Uczciwy komunikat zamiast zdjęcia budynku podstawionego pod
              // pokój — gość musi wiedzieć, że tego kadru po prostu nie ma.
              <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl bg-neutral-100 text-neutral-500">
                <ImageOff aria-hidden className="h-7 w-7" />
                <p className="text-sm">Dostawca nie udostępnił zdjęć tego pokoju</p>
              </div>
            )}

            {specs.length > 0 && (
              <ul className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-neutral-700">
                {specs.map(({ icon: Icon, text }) => (
                  <li key={text} className="inline-flex items-center gap-1.5">
                    <Icon aria-hidden className="h-4 w-4 text-neutral-400" />
                    {text}
                  </li>
                ))}
              </ul>
            )}

            {room?.description && (
              <p className="mt-4 whitespace-pre-line text-sm leading-6 text-neutral-700">
                {room.description}
              </p>
            )}

            {room?.amenities.length ? (
              <section className="mt-5">
                <h3 className="text-sm font-bold text-neutral-900">Wyposażenie pokoju</h3>
                {/* Pełna lista, nie trzy pozycje — to jest właśnie ta treść,
                    dla której gość otwiera szczegóły. Kolumny, bo lista bywa
                    długa (u części obiektów kilkadziesiąt pozycji). */}
                <ul className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm text-neutral-700 sm:grid-cols-2 lg:grid-cols-3">
                  {room.amenities.map((a) => (
                    <li key={a} className="flex items-start gap-1.5">
                      <span aria-hidden className="mt-1 text-emerald-600">
                        ·
                      </span>
                      {a}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="mt-6">
              <h3 className="text-sm font-bold text-neutral-900">Dostępne warianty</h3>
              <ul className="mt-2 divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200">
                {options}
              </ul>
            </section>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
