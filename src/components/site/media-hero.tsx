import Image from "next/image";
import type { ReactNode } from "react";

interface MediaHeroProps {
  /** Resolved hero photo (Pexels). Null → brand gradient fallback. */
  imageUrl: string | null;
  imageAlt: string;
  /**
   * Deliberately a plain string, not ReactNode.
   *
   * It used to be ReactNode, and all four callers used that freedom for the
   * same thing: a `bg-clip-text` gradient span on two or three words. Four
   * pages, one identical decoration, zero meaning. A string makes the whole
   * class of decoration impossible instead of asking the next author not to
   * do it. Emphasis inside a heading belongs to weight and size.
   */
  title: string;
  intro: string;
  /** CTA row + supporting facts. */
  children?: ReactNode;
}

// Shared editorial hero: full-bleed photo, white copy, bottom-anchored.
//
// SCRIM — the reason it is built as two elements instead of one overlay.
// Content is bottom-anchored but grows upward (a three-line h1 plus intro plus
// CTAs fills most of the box on 375 px). A single top-to-bottom gradient over
// the whole hero therefore leaves the first heading line sitting where the
// overlay is nearly transparent, and on a bright photo — beach, white wall,
// sky — that line drops to roughly 1.3:1. The fix is to tie the scrim to the
// text block: a fade strip immediately above it, then ≥0.72 alpha behind every
// line. 0.72 is the measured floor for 4.5:1 white-on-brightest-photo; 0.6
// gives 3.39:1 and fails.
export function MediaHero({ imageUrl, imageAlt, title, intro, children }: MediaHeroProps) {
  return (
    <section className="overflow-hidden rounded-[2rem] border border-line bg-surface-raised shadow-lg">
      <div className="relative flex min-h-[22rem] flex-col justify-end sm:min-h-[26rem]">
        {imageUrl ? (
          <Image src={imageUrl} alt={imageAlt} fill priority sizes="100vw" className="object-cover" />
        ) : (
          <div className="absolute inset-0 bg-brand-strong" />
        )}

        {/* Keeps the upper half of the photo readable as a photo. */}
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,18,11,0.32)_0%,rgba(5,18,11,0.10)_45%,rgba(5,18,11,0)_70%)]"
        />

        <div className="relative z-10 mt-auto w-full text-white [--focus-ring:#fff]">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-full h-16 bg-[linear-gradient(to_top,rgba(5,18,11,0.72),rgba(5,18,11,0))]"
          />
          <div className="relative bg-[linear-gradient(180deg,rgba(5,18,11,0.72)_0%,rgba(5,18,11,0.93)_45%,rgba(5,18,11,0.96)_100%)] p-6 sm:p-9 lg:p-12">
            <h1 className="max-w-4xl text-balance font-display text-hero font-semibold">{title}</h1>
            <p className="mt-4 max-w-2xl text-pretty text-base leading-7 text-white/90 sm:text-lg sm:leading-8">
              {intro}
            </p>
            {children ? <div className="mt-7">{children}</div> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
