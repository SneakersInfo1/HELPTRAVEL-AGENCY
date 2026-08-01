import Link from "next/link";

interface FinalCtaBannerProps {
  title: string;
  body: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}

// Closing CTA: dark brand band, one unmistakable primary action.
//
// The previous version used an amber→orange→rose gradient pill with an orange
// glow shadow and an UPPERCASE label. Three problems. The gradient belongs to
// no token in the design system, so the most important button on the page was
// the one element nothing else on the site matched. The glow was a fourth
// shadow level next to the three the system defines. And the accent ramp is
// reserved for prices — spending it on a button is exactly how "this number is
// money" stops meaning anything.
//
// On this dark band the primary action is a solid white pill: maximum contrast,
// no token borrowed, and it reads as primary without decoration.
export function FinalCtaBanner({
  title,
  body,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
}: FinalCtaBannerProps) {
  return (
    <section className="rounded-[2rem] bg-brand-strong p-6 text-white [--focus-ring:#fff] sm:p-10">
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-6">
        <div className="min-w-[16rem] flex-1">
          <h2 className="max-w-2xl text-balance font-display text-2xl sm:text-3xl">{title}</h2>
          <p className="mt-3 max-w-2xl text-pretty text-sm leading-7 text-white/85">{body}</p>
        </div>
        <div className="flex w-full flex-wrap gap-3 sm:w-auto">
          <Link
            href={primaryHref}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-white px-7 py-3 transition duration-150 ease-out active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 sm:flex-none"
          >
            {/* Global `a { color: inherit }` beats text-* on the anchor itself. */}
            <span className="text-sm font-bold text-brand-strong">{primaryLabel}</span>
          </Link>
          {secondaryHref && secondaryLabel ? (
            <Link
              href={secondaryHref}
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-white/35 px-6 py-3 transition duration-150 ease-out hover:bg-white/10 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 sm:flex-none"
            >
              <span className="text-sm font-semibold text-white">{secondaryLabel}</span>
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
