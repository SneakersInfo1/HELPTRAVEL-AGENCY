import Link from "next/link";

interface FinalCtaBannerProps {
  eyebrow: string;
  title: string;
  body: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}

// Dark emerald closing CTA with the amber→orange→rose gradient button —
// mirrors the homepage "Zacznij teraz" section so the conversion moment
// feels consistent across the site.
export function FinalCtaBanner({
  eyebrow,
  title,
  body,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
}: FinalCtaBannerProps) {
  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-emerald-900/20 bg-emerald-950 p-8 text-white shadow-[0_28px_80px_rgba(6,29,16,0.22)] sm:p-10">
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(110,231,183,0.20),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(251,191,36,0.14),transparent_32%)]"
      />
      <div className="relative flex flex-wrap items-center justify-between gap-6">
        <div className="min-w-[16rem] flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-200">{eyebrow}</p>
          <h2 className="mt-3 max-w-2xl font-display text-3xl leading-tight sm:text-4xl">{title}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-emerald-50/80">{body}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href={primaryHref}
            className="inline-flex h-12 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 via-orange-400 to-rose-400 px-7 text-sm font-bold uppercase tracking-[0.08em] text-emerald-950 shadow-[0_12px_40px_rgba(234,88,12,0.45)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_50px_rgba(234,88,12,0.6)]"
          >
            {primaryLabel} →
          </Link>
          {secondaryHref && secondaryLabel ? (
            <Link
              href={secondaryHref}
              className="inline-flex h-12 items-center justify-center rounded-full border border-white/30 bg-white/10 px-6 text-sm font-semibold text-white transition hover:bg-white/20"
            >
              {secondaryLabel}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
