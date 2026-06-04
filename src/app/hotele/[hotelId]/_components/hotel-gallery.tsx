"use client";

// Auto-rotating hotel gallery (replaces the static 6-photo grid). Shows ALL
// available hotel photos, cross-fading every 5s, with a Booking-style
// thumbnail strip, prev/next arrows and a counter. Pauses on hover, when the
// tab is hidden, and for users who prefer reduced motion. LiteAPI does not
// expose per-room photos on the rates payload, so this maximises the hotel-
// level imagery instead.

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

// 5s per slide — slow enough to actually look at each photo (the previous
// 2.2s felt like a flicker). User-requested 2026-06.
const ROTATE_MS = 5000;

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

  // Keep the active thumbnail centered IN THE STRIP — by scrolling the strip
  // itself, never the page.
  //
  // BUGFIX (2026-06): the previous implementation called
  // `el.scrollIntoView({ block: "nearest" })`, which walks the WHOLE ancestor
  // chain. Once the user scrolled down and the thumbnail strip left the
  // viewport, every auto-advance (every ROTATE_MS) made `scrollIntoView` yank
  // the WINDOW back up to reveal the strip — the "hotel page jumps to the top
  // every couple of seconds" bug that made detail pages unusable. `scrollBy`
  // on the strip element touches only its own horizontal `scrollLeft` and can
  // never move the page vertically.
  useEffect(() => {
    const strip = stripRef.current;
    const el = strip?.children[active] as HTMLElement | undefined;
    if (!strip || !el) return;
    const stripRect = strip.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const delta =
      elRect.left + elRect.width / 2 - (stripRect.left + stripRect.width / 2);
    if (Math.abs(delta) < 1) return;
    strip.scrollBy({ left: delta, behavior: "smooth" });
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
      {/* Main stage — stacked cross-fade. Taller than before so photos look
          immersive instead of cropped (user feedback 2026-06). */}
      <div className="relative h-[300px] overflow-hidden rounded-2xl bg-neutral-100 sm:h-[460px] lg:h-[560px]">
        {photos.map((src, i) => (
          <Image
            key={src + i}
            src={src}
            alt={i === active ? alt : ""}
            fill
            priority={i === 0}
            fetchPriority={i === 0 ? "high" : undefined}
            loading={i === 0 ? undefined : "lazy"}
            sizes="(max-width: 1024px) 100vw, 1280px"
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
              className="absolute left-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-2xl text-neutral-800 shadow-md transition hover:bg-white"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Następne zdjęcie"
              className="absolute right-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-2xl text-neutral-800 shadow-md transition hover:bg-white"
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

      {/* Thumbnail strip — bigger tiles so they read as photos, not crops. */}
      {n > 1 && (
        <div ref={stripRef} className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {photos.map((src, i) => (
            <button
              key={src + i}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Pokaż zdjęcie ${i + 1}`}
              className={`relative h-16 w-24 flex-none overflow-hidden rounded-lg ring-2 transition sm:h-20 sm:w-28 ${
                i === active ? "ring-emerald-600" : "ring-transparent hover:ring-emerald-300"
              }`}
            >
              <Image
                src={src}
                alt=""
                fill
                loading="lazy"
                sizes="112px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
