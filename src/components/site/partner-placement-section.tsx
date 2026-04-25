import Link from "next/link";

export interface PartnerPlacementCard {
  title: string;
  description: string;
  partnerLabels: string[];
  href: string;
  ctaLabel: string;
  note?: string;
  sourceLabel?: string;
}

export interface PartnerPlacementSectionProps {
  eyebrow: string;
  title: string;
  body: string;
  cards: PartnerPlacementCard[];
  footerNote?: string;
}

function isExternalHref(href: string) {
  return href.startsWith("http://") || href.startsWith("https://");
}

export function PartnerPlacementSection({ eyebrow, title, body, cards, footerNote }: PartnerPlacementSectionProps) {
  return (
    <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_56px_rgba(16,84,48,0.06)]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">{eyebrow}</p>
          <h2 className="mt-2 font-display text-4xl text-emerald-950 sm:text-5xl">{title}</h2>
          <p className="mt-4 text-sm leading-7 text-emerald-900/74">{body}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {cards.map((card) => {
          const external = isExternalHref(card.href);

          return (
            <article key={card.title} className="rounded-[1.7rem] border border-emerald-900/10 bg-emerald-50/72 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-md">
                  <h3 className="text-2xl font-bold text-emerald-950">{card.title}</h3>
                  <p className="mt-2 text-sm leading-7 text-emerald-900/78">{card.description}</p>
                </div>
                {card.note ? (
                  <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-900 shadow-sm">
                    {card.note}
                  </span>
                ) : null}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {card.sourceLabel ? (
                  <span className="rounded-full bg-emerald-950 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-white">
                    {card.sourceLabel}
                  </span>
                ) : null}
                {card.partnerLabels.map((label) => (
                  <span
                    key={label}
                    className="rounded-full border border-emerald-900/10 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-emerald-950"
                  >
                    {label}
                  </span>
                ))}
              </div>

              <div className="mt-5">
                {external ? (
                  <a
                    href={card.href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex rounded-full bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800"
                  >
                    {card.ctaLabel}
                  </a>
                ) : (
                  <Link
                    href={card.href}
                    className="inline-flex rounded-full bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800"
                  >
                    {card.ctaLabel}
                  </Link>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {footerNote ? <p className="mt-5 text-xs leading-6 text-emerald-900/62">{footerNote}</p> : null}
    </section>
  );
}
