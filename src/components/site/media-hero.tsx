import Image from "next/image";
import type { ReactNode } from "react";

interface MediaHeroProps {
  /** Resolved hero photo (Pexels). Null → emerald gradient fallback. */
  imageUrl: string | null;
  imageAlt: string;
  eyebrow: string;
  /** ReactNode so callers can drop a gradient-highlighted <span> inside. */
  title: ReactNode;
  intro: string;
  /** CTA row + trust chips. */
  children?: ReactNode;
}

// Shared editorial hero: full-bleed photo under a bottom-weighted dark
// gradient with white copy — the same treatment as the homepage and the
// /hotele/w/[miasto] commercial landings. `min-h + flex/justify-end` (not a
// fixed height + absolute content) so a tall H1 + intro + CTAs never get
// clipped on mobile; the image (fill) covers whatever height the box grows to.
export function MediaHero({ imageUrl, imageAlt, eyebrow, title, intro, children }: MediaHeroProps) {
  return (
    <section className="overflow-hidden rounded-[2rem] border border-emerald-900/10 bg-white shadow-[0_24px_70px_rgba(16,84,48,0.10)]">
      <div className="relative flex min-h-[24rem] flex-col justify-end sm:min-h-[28rem]">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={imageAlt}
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-700 to-emerald-950" />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,18,11,0.10)_0%,rgba(5,18,11,0.46)_46%,rgba(5,18,11,0.88)_100%)]" />
        <div className="relative z-10 p-6 text-white sm:p-9 lg:p-12">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200">{eyebrow}</p>
          <h1 className="mt-3 max-w-4xl font-display text-3xl font-semibold leading-[1.06] drop-shadow-[0_2px_18px_rgba(0,0,0,0.45)] sm:text-5xl sm:leading-[0.98] md:text-6xl">
            {title}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-white/88 drop-shadow-[0_1px_10px_rgba(0,0,0,0.3)] sm:text-lg sm:leading-8">
            {intro}
          </p>
          {children ? <div className="mt-7">{children}</div> : null}
        </div>
      </div>
    </section>
  );
}
