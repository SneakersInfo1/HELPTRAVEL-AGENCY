"use client";

// Podgląd KONKRETNEGO pokoju (brief §11, przebudowa V3 §29-§35).
//
// Modal, nie osobna strona: wybór pokoju jest fragmentem jednej decyzji.
// Przeładowanie gubi kontekst (pozycję na liście, porównanie z sąsiednim
// wariantem) i kosztuje kolejne pobranie stawek.
//
// Radix Dialog daje focus trap, Escape, blokadę scrolla tła i `aria-modal`.
// Zdjęcia pochodzą z `rooms[].photos` powiązanych przez `rate.mappedRoomId` —
// NIGDY nie podstawiamy zdjęć budynku (decyzja R10).
//
// TRZY BŁĘDY NAPRAWIONE W V3:
//
// 1. SUROWY HTML W OPISIE. `rooms[].description` przychodzi jako HTML
//    (zmierzone: 100% opisów), a szedł do widoku jako zwykły tekst — gość
//    widział dosłownie `<p><strong>…</strong></p>`. Teraz opis przechodzi
//    przez `parseRoomDescription`, które rozbija go na pary etykieta/treść.
//    Do DOM trafia wyłącznie tekst; `dangerouslySetInnerHTML` nie występuje.
//
// 2. AGRESYWNE KADROWANIE. `object-cover` na sztywnej wysokości zjadał połowę
//    pokoju, bo zdjęcia bywają pionowe. Teraz `object-contain` na neutralnym
//    tle — kompozycja zdjęcia zostaje nienaruszona.
//
// 3. ZA MAŁY MODAL. Zdjęcie pokoju to jeden z najważniejszych elementów
//    decyzji, a dostawało ~940 px szerokości i 320 px wysokości.

import * as Dialog from "@radix-ui/react-dialog";
import Image from "next/image";
import {
  BedDouble,
  ChevronLeft,
  ChevronRight,
  ImageOff,
  Ruler,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import type { RoomProfile } from "@/lib/hotels/domain/types";
import { guestsLabel } from "@/lib/hotels/domain/format";
import { parseRoomDescription, topRoomAmenities } from "@/lib/hotels/domain/room-description";

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

  const opis = parseRoomDescription(room?.description);
  const wazne = topRoomAmenities(room?.amenities ?? [], 6);
  const reszta = (room?.amenities ?? []).filter((a) => !wazne.includes(a));

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          // Brief §31: modal ma przypominać dojrzały interfejs rezerwacyjny,
          // a nie okienko dialogowe. Na telefonie pełny ekran.
          className="fixed inset-0 z-[80] flex flex-col bg-white focus:outline-none sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[90dvh] sm:w-[min(90vw,1350px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:shadow-2xl"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <header className="flex shrink-0 items-start justify-between gap-3 border-b border-neutral-200 px-4 py-3 sm:px-6 sm:py-4">
            <div className="min-w-0">
              <Dialog.Title className="truncate text-lg font-bold text-neutral-900 sm:text-xl">
                {title}
              </Dialog.Title>
              <p className="text-sm text-neutral-500">Szczegóły pokoju</p>
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

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4 sm:px-6">
            <div className="lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-8">
              {/* ── Kolumna zdjęć i opisu ──────────────────────────────── */}
              <div>
                {n > 0 ? (
                  <>
                    {/* `object-contain` na neutralnym tle. `cover` na sztywnej
                        wysokości kadrował pokój tak, że znikała połowa
                        pomieszczenia — a to jedyne zdjęcie, na podstawie
                        którego gość ocenia, co kupuje. */}
                    <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-neutral-100">
                      <Image
                        key={photos[index].url}
                        src={photos[index].url}
                        alt={photos[index].description?.trim() || `${title} — zdjęcie ${index + 1} z ${n}`}
                        fill
                        sizes="(max-width: 1023px) 100vw, 720px"
                        className="object-contain"
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

                    {n > 1 && (
                      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                        {photos.map((p, i) => (
                          <button
                            key={p.url + i}
                            type="button"
                            onClick={() => setIndex(i)}
                            aria-label={`Pokaż zdjęcie ${i + 1}`}
                            aria-current={i === index}
                            className={`relative h-14 w-20 shrink-0 overflow-hidden rounded-lg ring-2 transition ${
                              i === index ? "ring-emerald-600" : "ring-transparent hover:ring-emerald-300"
                            }`}
                          >
                            {/* Miniatury MOGĄ kadrować — tu liczy się rozpoznanie
                                kadru, nie jego kompozycja (brief §30). */}
                            <Image src={p.url} alt="" fill sizes="80px" className="object-cover" loading="lazy" />
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  // Uczciwy komunikat zamiast zdjęcia budynku podstawionego
                  // pod pokój — gość musi wiedzieć, że tego kadru nie ma.
                  <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-xl bg-neutral-100 text-neutral-500">
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

                {wazne.length > 0 && (
                  <section className="mt-5">
                    <h3 className="text-sm font-bold text-neutral-900">Najważniejsze udogodnienia</h3>
                    <ul className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm text-neutral-700 sm:grid-cols-2">
                      {wazne.map((a) => (
                        <li key={a} className="flex items-start gap-2">
                          <span aria-hidden className="mt-[3px] text-emerald-600">
                            ✓
                          </span>
                          {a}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {opis.length > 0 && (
                  <section className="mt-5">
                    <h3 className="text-sm font-bold text-neutral-900">Opis pokoju</h3>
                    <dl className="mt-2 space-y-1.5 text-sm leading-6 text-neutral-700">
                      {opis.map((p, i) =>
                        p.label ? (
                          <div key={`${p.label}-${i}`} className="flex flex-wrap gap-x-2">
                            <dt className="font-semibold text-neutral-900">{p.label}</dt>
                            <dd className="min-w-0 flex-1 text-neutral-700">{p.text}</dd>
                          </div>
                        ) : (
                          <p key={`p-${i}`} className="text-neutral-700">
                            {p.text}
                          </p>
                        ),
                      )}
                    </dl>
                  </section>
                )}

                {reszta.length > 0 && (
                  <details className="mt-4 group">
                    <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold text-emerald-700 hover:text-emerald-800">
                      Zobacz wszystkie udogodnienia ({reszta.length + wazne.length})
                    </summary>
                    <ul className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm text-neutral-700 sm:grid-cols-2 lg:grid-cols-2">
                      {reszta.map((a) => (
                        <li key={a} className="flex items-start gap-1.5">
                          <span aria-hidden className="mt-1 text-neutral-400">
                            ·
                          </span>
                          {a}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>

              {/* ── Kolumna wariantów ──────────────────────────────────── */}
              <section className="mt-6 lg:mt-0">
                <h3 className="text-sm font-bold text-neutral-900">Dostępne warianty</h3>
                <ul className="mt-2 divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200">
                  {options}
                </ul>
              </section>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
