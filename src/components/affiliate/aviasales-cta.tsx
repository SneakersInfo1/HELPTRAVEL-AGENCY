import { AffiliateDisclosure } from "./affiliate-disclosure";
import { buildTravelpayoutsLink, getAffiliateConfig } from "@/lib/mvp/affiliate-config";

interface AviasalesCtaProps {
  city: string;
  country: string;
  campaign?: string;
  flightHours?: number;
}

// Sekcja CTA prowadzaca do wyszukiwarki Aviasales (najwyzsza prowizja w portfolio Travelpayouts).
// Bez znajomosci IATA destynacji — uzytkownik dokaczy reszte w Aviasales.
export function AviasalesCta({ city, country, campaign = "destination", flightHours }: AviasalesCtaProps) {
  const config = getAffiliateConfig();
  const link = buildTravelpayoutsLink("aviasales", { campaign, destination: { city, country } });
  const flightLine =
    typeof flightHours === "number"
      ? `Zwykle okolo ${flightHours.toFixed(1)} h lotu z ${config.defaultOriginCity}.`
      : `Wylot zwykle z ${config.defaultOriginCity}.`;

  return (
    <div className="rounded-[1.6rem] border border-emerald-900/10 bg-[linear-gradient(135deg,#ecfdf5_0%,#d1fae5_100%)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Loty z Polski</p>
          <h3 className="mt-1 font-display text-2xl text-emerald-950">
            Sprawdz aktualne ceny lotow do {city}
          </h3>
          <p className="mt-2 text-sm leading-7 text-emerald-900/82">
            Porownaj oferty linii i tani lotow w Aviasales. {flightLine} Bez doplaty za korzystanie z porownywarki.
          </p>
        </div>
        <AffiliateDisclosure inline />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={link}
          target="_blank"
          rel="noopener nofollow sponsored"
          className="rounded-full bg-emerald-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-800"
        >
          Sprawdz loty w Aviasales
        </a>
      </div>
    </div>
  );
}
