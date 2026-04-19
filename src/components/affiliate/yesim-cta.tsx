import { buildTravelpayoutsLink } from "@/lib/mvp/affiliate-config";

interface YesimCtaProps {
  country: string;
  campaign?: string;
}

// CTA do Yesim eSIM. Przydatne na kierunkach poza UE i tam, gdzie roaming bywa drogi.
// 18% prowizji z Travelpayouts — wysoki ROI dla niskiej bariery zakupowej.
export function YesimCta({ country, campaign = "esim" }: YesimCtaProps) {
  const link = buildTravelpayoutsLink("yesim", { campaign });
  return (
    <div className="rounded-[1.6rem] border border-emerald-900/10 bg-emerald-950 p-5 text-white">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">Internet w {country}</p>
          <h3 className="mt-1 font-display text-2xl">Aktywny od momentu wladowania</h3>
          <p className="mt-2 text-sm leading-7 text-emerald-100/85">
            eSIM Yesim — zalogowanie do internetu zaraz po wyladowaniu, bez szukania Wi-Fi i bez kosztow roamingu poza UE.
            Dziala w 200+ krajach, kupujesz przed wyjazdem, instalujesz w 2 minuty.
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <a
          href={link}
          target="_blank"
          rel="noopener nofollow sponsored"
          className="rounded-full bg-emerald-400 px-5 py-3 text-sm font-bold text-emerald-950 transition hover:bg-emerald-300"
        >
          Sprawdz eSIM Yesim
        </a>
        <span className="text-[10px] uppercase tracking-[0.18em] text-emerald-300/80">Linki partnerskie</span>
      </div>
    </div>
  );
}
