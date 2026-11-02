"use client";

import { getImageProps } from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { preload } from "react-dom";

import { pexelsCenterCrop } from "@/lib/images/pexels-crop";

interface CinematicBackdropProps {
  images: Array<{
    src: string;
    alt: string;
  }>;
  intervalMs?: number;
}

const QUALITY = 70;

// Hero jest WYSOKI a wąski na mobile → object-cover mocno przycina zdjęcie
// poziomo i skaluje w pionie. `100vw` kazałby pobrać obraz szeroki na viewport
// (np. 390 px) = za mało pikseli na wysoki kadr → miękko. Na mobile/tablecie
// 1280 px CSS, czyli przy DPR 2–3 rendition 3840 px.
const LANDSCAPE_SIZES = "(max-width: 1024px) 1280px, 100vw";

// Telefon w pionie: hero ma tam min. 600 px wysokości (min-h w
// home-hybrid-hero) i ≤ 480 px szerokości, więc proporcja pola ≤ 0,8. Wycinek
// 0,8 w pełnej wysokości źródła (src/lib/images/pexels-crop.ts) pokazuje więc
// DOKŁADNIE ten sam fragment co rendition 3840 px — przy 37–65 % mniejszym
// pliku. Wycinek wypełnia wysokość pola (~740 px) → ~600 px CSS szerokości.
const PHONE = "(max-width: 480px)";
const NOT_PHONE = "not all and (max-width: 480px)";
const PHONE_SIZES = "600px";

function phoneSrcSet(src: string): { href: string; srcSet: string } | null {
  const dpr2 = pexelsCenterCrop(src, 1366, 1707, QUALITY);
  const dpr3 = pexelsCenterCrop(src, 2048, 2560, QUALITY);
  return dpr2 && dpr3 ? { href: dpr3, srcSet: `${dpr2} 1366w, ${dpr3} 2048w` } : null;
}

// Cinematic hero backdrop: rotates through hero images with cross-fade + ken-burns zoom.
// Each slide is 8s visible + 1s fade. Uses CSS animations for ken-burns (no JS).
export function CinematicBackdrop({ images, intervalMs = 7000 }: CinematicBackdropProps) {
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState<ReadonlySet<number>>(() => new Set());
  const loadedRef = useRef<ReadonlySet<number>>(loaded);
  useEffect(() => {
    loadedRef.current = loaded;
  }, [loaded]);

  const markLoaded = useCallback((i: number) => {
    setLoaded((prev) => (prev.has(i) ? prev : new Set(prev).add(i)));
  }, []);

  useEffect(() => {
    if (images.length <= 1) return;
    const id = window.setInterval(() => {
      // Tylko na slajd, który już się wczytał — przenikanie do niewczytanego
      // odsłoniłoby na wolnym łączu puste tło.
      setIndex((i) => {
        const next = (i + 1) % images.length;
        return loadedRef.current.has(next) ? next : i;
      });
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [images.length, intervalMs]);

  if (images.length === 0) return null;

  // Render only current slide + the next one to avoid preloading all 6 hero images on mobile.
  // Następny slajd montujemy dopiero, gdy bieżący się wczytał: wcześniej oba
  // startowały razem i drugi (~480 KB) konkurował o łącze z obrazem LCP.
  const nextIndex = (index + 1) % images.length;
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden">
      {images.map((img, i) => {
        const isVisible = i === index;
        const shouldRender = isVisible || i === 0 || (i === nextIndex && loaded.has(index));
        if (!shouldRender) return null;

        const first = i === 0;
        const { props: landscape } = getImageProps({
          src: img.src,
          alt: img.alt,
          fill: true,
          quality: QUALITY,
          sizes: LANDSCAPE_SIZES,
          loading: first ? "eager" : "lazy",
          fetchPriority: first ? "high" : undefined,
        });
        const phone = phoneSrcSet(img.src);
        if (first) {
          // Zamiast `priority`: jego preload nie zna `media`, więc telefon
          // pobierałby RÓWNIEŻ rendition 3840 px, a potem wycinek z <source>.
          if (phone) {
            preload(phone.href, { as: "image", imageSrcSet: phone.srcSet, imageSizes: PHONE_SIZES, fetchPriority: "high", media: PHONE });
          }
          preload(landscape.src, {
            as: "image",
            imageSrcSet: landscape.srcSet,
            imageSizes: landscape.sizes,
            fetchPriority: "high",
            media: phone ? NOT_PHONE : undefined,
          });
        }

        return (
          <div
            key={img.src}
            className={`absolute inset-0 transition-opacity duration-[1400ms] ease-in-out ${
              isVisible ? "opacity-100" : "opacity-0"
            }`}
          >
            <div className="ht-kenburns absolute inset-0">
              <picture>
                {phone ? <source media={PHONE} srcSet={phone.srcSet} sizes={PHONE_SIZES} /> : null}
                {/* getImageProps + <img>: wzorzec art direction z dokumentacji Nexta (<Image> nie przyjmuje <source>). */}
                <img
                  {...landscape}
                  alt={img.alt}
                  className="object-cover"
                  // Obraz z HTML-a potrafi się wczytać przed hydratacją — wtedy
                  // onLoad już nie przyjdzie, więc sprawdzamy `complete` w ref.
                  ref={(el) => {
                    if (el?.complete && el.naturalWidth > 0) markLoaded(i);
                  }}
                  onLoad={() => markLoaded(i)}
                />
              </picture>
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
