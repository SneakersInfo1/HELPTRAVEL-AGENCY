"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

interface CinematicBackdropProps {
  images: Array<{
    src: string;
    alt: string;
  }>;
  intervalMs?: number;
}

// Cinematic hero backdrop: rotates through hero images with cross-fade + ken-burns zoom.
// Each slide is 8s visible + 1s fade. Uses CSS animations for ken-burns (no JS).
export function CinematicBackdrop({ images, intervalMs = 7000 }: CinematicBackdropProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (images.length <= 1) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % images.length);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [images.length, intervalMs]);

  if (images.length === 0) return null;

  // Render only current slide + the next one to avoid preloading all 6 hero images on mobile.
  const nextIndex = (index + 1) % images.length;
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden">
      {images.map((img, i) => {
        const isVisible = i === index;
        const shouldRender = isVisible || i === nextIndex || i === 0;
        if (!shouldRender) return null;
        return (
          <div
            key={img.src}
            className={`absolute inset-0 transition-opacity duration-[1400ms] ease-in-out ${
              isVisible ? "opacity-100" : "opacity-0"
            }`}
          >
            <div className="ht-kenburns absolute inset-0">
              <Image
                src={img.src}
                alt={img.alt}
                fill
                priority={i === 0}
                fetchPriority={i === 0 ? "high" : undefined}
                loading={i === 0 ? "eager" : "lazy"}
                quality={70}
                // Hero to zdjęcie object-cover na pełnej szerokości i sporej
                // wysokości — na telefonie kontener jest „wyższy" niż naturalny
                // kadr, więc `100vw` (≈ szerokość) niedoszacowywał rozdzielczości
                // i zdjęcie wychodziło rozpikselowane. Na ≤1024px deklarujemy
                // ~960px, żeby przeglądarka pobrała ~1920px (ostro przy DPR 2-3).
                sizes="(max-width: 1024px) 960px, 100vw"
                className="object-cover"
              />
            </div>
          </div>
        );
      })}
      {/* Scrim: ciemniejszy u góry (nagłówek) i na dole (formularz + przejście
          do kafelków), ale ROZJAŚNIONY w środku — żeby zdjęcie było żywe i
          premium, a nie przygłuszone „mułem". Czytelność tekstu zapewniają
          dodatkowo drop-shadowy i własne tło formularza. */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,16,11,0.50)_0%,rgba(4,16,11,0.16)_40%,rgba(4,16,11,0.32)_66%,rgba(4,16,11,0.88)_100%)]" />
      {/* Delikatny vignette tylko w rogach (skupiony u góry-środka, mniej
          przyciemnia centrum kadru niż poprzedni 0.35 na całym środku). */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_50%_32%,transparent_56%,rgba(4,16,11,0.32)_100%)]" />
    </div>
  );
}
