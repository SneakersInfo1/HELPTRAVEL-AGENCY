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
                loading={i === 0 ? "eager" : "lazy"}
                sizes="100vw"
                className="object-cover"
              />
            </div>
          </div>
        );
      })}
      {/* Ciemny gradient na dole zeby tekst byl czytelny */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,18,11,0.15)_0%,rgba(5,18,11,0.55)_55%,rgba(5,18,11,0.85)_100%)]" />
      {/* Lekki vignette na bokach */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(5,18,11,0.35)_100%)]" />
    </div>
  );
}
