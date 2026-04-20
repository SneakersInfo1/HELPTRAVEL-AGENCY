import { Stay22Widget } from "@/components/affiliate/stay22-widget";
import { LocalizedLink } from "@/components/site/localized-link";
import { buildPlannerLink } from "@/lib/mvp/planner-links";

interface KierunkiHeroCtaProps {
  city: string;
  country: string;
  campaign: string;
  stay22Aid: string | null;
  // Parametry przekazywane do plannera i Stay22.
  startDate?: string;
  checkOutDate?: string;
  nights?: number;
  travelers?: number;
  budget?: number;
}

// Wspolny above-fold CTA dla stron kierunkow.
// Lewa: grube klikalne CTA do plannera z preselected destynacja i rozsadnymi defaultami.
// Prawa: Stay22 widget (CTA-button wariant, bez iframe — stabilne CSP, szybszy LCP).
// Mobile: stack vertykalny, CTA plannera pierwsze.
export function KierunkiHeroCta({
  city,
  country,
  campaign,
  stay22Aid,
  startDate,
  checkOutDate,
  nights = 4,
  travelers = 2,
  budget,
}: KierunkiHeroCtaProps) {
  const plannerHref = buildPlannerLink({
    destination: city,
    origin: "Warszawa",
    startDate,
    nights,
    travelers,
    budget,
    q: city,
  });

  return (
    <section className="grid gap-4 lg:grid-cols-2 lg:items-stretch">
      <article className="flex flex-col justify-between rounded-[1.8rem] border border-emerald-900/10 bg-emerald-950 p-6 text-white shadow-[0_18px_42px_rgba(7,31,18,0.18)]">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300">
            Zaplanuj wyjazd
          </p>
          <h2 className="mt-2 font-display text-3xl leading-tight">
            {city} w jednym widoku — noclegi, loty i atrakcje.
          </h2>
          <p className="mt-3 text-sm leading-7 text-emerald-100/85">
            Otworz planner z gotowymi ustawieniami ({nights} nocy, {travelers} osoby, start z Warszawy).
            Zmienisz dowolny parametr w planerze jednym kliknieciem.
          </p>
        </div>
        <div className="mt-5">
          <LocalizedLink
            href={plannerHref}
            className="inline-flex items-center justify-center rounded-full bg-emerald-400 px-6 py-3 text-sm font-bold text-emerald-950 transition hover:bg-emerald-300"
          >
            Zaplanuj wyjazd do {city}
          </LocalizedLink>
        </div>
      </article>
      <div>
        <Stay22Widget
          city={city}
          country={country}
          aid={stay22Aid}
          campaign={campaign}
          checkin={startDate}
          checkout={checkOutDate}
        />
      </div>
    </section>
  );
}
