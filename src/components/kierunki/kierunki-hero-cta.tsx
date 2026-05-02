import { LocalizedLink } from "@/components/site/localized-link";
import { buildPlannerLink } from "@/lib/mvp/planner-links";

interface KierunkiHeroCtaProps {
  city: string;
  country: string;
  campaign: string;
  startDate?: string;
  checkOutDate?: string;
  nights?: number;
  travelers?: number;
  budget?: number;
}

// Hero CTA dla stron kierunków — Phase 1 affiliate purge:
//   • lewa: planer z preselected destynacją
//   • prawa: internal hotele search (LiteAPI display, Phase 2+)
// Wszystkie inne CTA do partnerów hotelowych zostały usunięte z tego komponentu.
export function KierunkiHeroCta({
  city,
  country,
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

  const hotelHref = `/hotele/szukaj?${new URLSearchParams({
    destination: city,
    country,
    ...(startDate ? { checkin: startDate } : {}),
    ...(checkOutDate ? { checkout: checkOutDate } : {}),
    travelers: String(travelers),
    rooms: "1",
  }).toString()}`;

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
            Zmienisz dowolny parametr w planerze jednym kliknięciem.
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
      <article className="flex flex-col justify-between rounded-[1.8rem] border border-emerald-900/10 bg-emerald-700 p-6 text-white shadow-[0_18px_42px_rgba(7,31,18,0.16)]">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-100/85">Hotele</p>
          <h2 className="mt-2 font-display text-3xl leading-tight">
            Sprawdź konkretne hotele w {city}.
          </h2>
          <p className="mt-3 text-sm leading-7 text-emerald-50/85">
            Ceny w PLN dla Twojego terminu i liczby gości. Finalizujesz u dostawcy bez wychodzenia z naszej strony.
          </p>
        </div>
        <div className="mt-5">
          <LocalizedLink
            href={hotelHref}
            className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-bold text-emerald-900 transition hover:bg-emerald-100"
          >
            Zobacz hotele w {city}
          </LocalizedLink>
        </div>
      </article>
    </section>
  );
}
