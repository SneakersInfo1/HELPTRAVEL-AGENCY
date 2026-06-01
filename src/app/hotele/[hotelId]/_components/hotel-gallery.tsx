"use client";

// Auto-rotating hotel gallery (replaces the static 6-photo grid). Shows ALL
// available hotel photos, cross-fading every ~2.2s, with a Booking-style
// thumbnail strip, prev/next arrows and a counter. Pauses on hover, when the
// tab is hidden, and for users who prefer reduced motion. LiteAPI does not
// expose per-room photos on the rates payload, so this maximises the hotel-
// level imagery instead.

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const ROTATE_MS = 2200;

export function HotelGallery({ photos, alt }: { photos: string[]; alt: string }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const n = photos.length;

  // Auto-advance — disabled for a single photo, while paused, or under
  // prefers-reduced-motion.
  useEffect(() => {
    if (n <= 1 || paused) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setActive((i) => (i + 1) % n), ROTATE_MS);
    return () => window.clearInterval(id);
  }, [n, paused]);

  // Pause when the browser tab is not visible.
  useEffect(() => {
    const onVis = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Keep the active thumbnail scrolled into view.
  useEffect(() => {
    const strip = stripRef.current;
    const el = strip?.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [active]);

  if (n === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl bg-neutral-200 text-neutral-400">
        Brak zdjęć
      </div>
    );
  }

  const go = (dir: 1 | -1) => setActive((i) => (i + dir + n) % n);

  return (
    <div
      className="select-none"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Main stage — stacked cross-fade */}
      <div className="relative h-[260px] overflow-hidden rounded-2xl bg-neutral-100 sm:h-[440px]">
        {photos.map((src, i) => (
          <Image
            key={src + i}
            src={src}
            alt={i === active ? alt : ""}
            fill
            priority={i === 0}
            fetchPriority={i === 0 ? "high" : undefined}
            loading={i === 0 ? undefined : "lazy"}
            sizes="(max-width: 1024px) 100vw, 1024px"
            className={`object-cover transition-opacity duration-700 ease-out ${
              i === active ? "opacity-100" : "opacity-0"
            }`}
            aria-hidden={i !== active}
          />
        ))}

        {/* Counter */}
        <div className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm tabular-nums">
          {active + 1} / {n}
        </div>

        {n > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Poprzednie zdjęcie"
              className="absolute left-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-neutral-800 shadow-md transition hover:bg-white"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Następne zdjęcie"
              className="absolute right-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-neutral-800 shadow-md transition hover:bg-white"
            >
              ›
            </button>
            {/* Dots */}
            <div className="absolute inset-x-0 bottom-3 z-10 flex flex-wrap items-center justify-center gap-1.5 px-4">
              {photos.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActive(i)}
                  aria-label={`Zdjęcie ${i + 1}`}
                  aria-current={i === active}
                  className={`h-1.5 rounded-full transition-all ${
                    i === active ? "w-5 bg-white" : "w-1.5 bg-white/55 hover:bg-white/80"
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Thumbnail strip */}
      {n > 1 && (
        <div ref={stripRef} className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {photos.map((src, i) => (
            <button
              key={src + i}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Pokaż zdjęcie ${i + 1}`}
              className={`relative h-14 w-20 flex-none overflow-hidden rounded-lg ring-2 transition sm:h-16 sm:w-24 ${
                i === active ? "ring-emerald-600" : "ring-transparent hover:ring-emerald-300"
              }`}
            >
              <Image
                src={src}
                alt=""
                fill
                loading="lazy"
                sizes="96px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
