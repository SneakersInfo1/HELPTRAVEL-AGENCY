"use client";

// Pełnoekranowy podgląd zdjęć hotelu (brief §11.2).
//
// Radix Dialog daje za darmo rzeczy, które przy własnym modalu prawie zawsze
// wychodzą źle: focus trap, zamykanie Escape, blokadę scrolla tła i poprawne
// `aria-modal`. Nie dokładamy biblioteki lightboxa — Radix i `next/image`
// wystarczą (07-decisions.md R2).

import * as Dialog from "@radix-ui/react-dialog";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface Props {
  photos: string[];
  alt: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Zdjęcie, od którego zaczynamy (indeks w `photos`). */
  startIndex?: number;
}

export function GalleryLightbox({ photos, alt, open, onOpenChange, startIndex = 0 }: Props) {
  // Stan startowy zamiast synchronizacji efektem: rodzic REMONTUJE ten
  // komponent przy otwarciu (`key`), więc `useState` inicjalizuje się właściwym
  // zdjęciem. Wariant z `useEffect(() => setIndex(...))` jest w tym projekcie
  // błędem lintu (React Compiler: „cascading renders") — i słusznie, bo dawał
  // dodatkowy render z niewłaściwym zdjęciem.
  const [index, setIndex] = useState(startIndex);
  const n = photos.length;

  const prev = useCallback(() => setIndex((i) => (i - 1 + n) % n), [n]);
  const next = useCallback(() => setIndex((i) => (i + 1) % n), [n]);

  // Strzałki. Escape obsługuje Radix, więc go tu nie dublujemy.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, prev, next]);

  if (n === 0) return null;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/90 data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content
          className="fixed inset-0 z-[80] flex flex-col focus:outline-none"
          // Bez tego Radix przenosi focus na pierwszy element (przycisk „wstecz")
          // i czytnik zaczyna od nawigacji zamiast od treści.
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Dialog.Title className="sr-only">{alt} — galeria zdjęć</Dialog.Title>
          <Dialog.Description className="sr-only">
            Zdjęcie {index + 1} z {n}. Strzałki w lewo i w prawo przełączają zdjęcia, Escape zamyka.
          </Dialog.Description>

          <header className="flex shrink-0 items-center justify-between px-4 py-3 text-white">
            <span className="text-sm tabular-nums" aria-live="polite">
              {index + 1} / {n}
            </span>
            <Dialog.Close
              // 44 px celu dotyku (WCAG 2.2 AA) mimo mniejszej ikony.
              className="flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-white/15"
              aria-label="Zamknij galerię"
            >
              <X aria-hidden className="h-5 w-5" />
            </Dialog.Close>
          </header>

          <div className="relative flex min-h-0 flex-1 items-center justify-center">
            <Image
              key={photos[index]}
              src={photos[index]}
              alt={`${alt} — zdjęcie ${index + 1} z ${n}`}
              fill
              sizes="100vw"
              className="object-contain"
              priority
            />

            {n > 1 && (
              <>
                <button
                  type="button"
                  onClick={prev}
                  aria-label="Poprzednie zdjęcie"
                  className="absolute left-2 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/70 sm:left-4"
                >
                  <ChevronLeft aria-hidden className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  onClick={next}
                  aria-label="Następne zdjęcie"
                  className="absolute right-2 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/70 sm:right-4"
                >
                  <ChevronRight aria-hidden className="h-6 w-6" />
                </button>
              </>
            )}
          </div>

          {n > 1 && (
            <div className="shrink-0 overflow-x-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
              <div className="flex gap-2">
                {photos.map((src, i) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => setIndex(i)}
                    aria-label={`Pokaż zdjęcie ${i + 1}`}
                    aria-current={i === index}
                    className={`relative h-14 w-20 shrink-0 overflow-hidden rounded-lg transition ${
                      i === index ? "ring-2 ring-white" : "opacity-60 hover:opacity-100"
                    }`}
                  >
                    <Image src={src} alt="" width={160} height={112} sizes="80px" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
