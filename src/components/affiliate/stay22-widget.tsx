import { AffiliateDisclosure } from "./affiliate-disclosure";

interface Stay22WidgetProps {
  city: string;
  country: string;
  aid: string | null;
  campaign?: string;
  checkin?: string;
  checkout?: string;
  // height nie jest juz uzywany (zostal dla zgodnosci z istniejacymi wywolaniami).
  height?: number;
}

// CTA do Stay22 — przycisk otwierajacy mape hoteli w nowej karcie.
// Iframe Stay22 byl zawodny (CSP / X-Frame), wiec idziemy w przycisk:
// szybciej sie laduje (lepszy CLS/LCP), bardziej spojny styl, klikniecie
// nadal idzie z naszym AID i campaign do rozliczenia prowizji.
export function Stay22Widget({ city, country, aid, campaign, checkin, checkout }: Stay22WidgetProps) {
  if (!aid) {
    return (
      <div className="rounded-[1.6rem] border border-emerald-900/10 bg-emerald-50/72 p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Hotele i noclegi</p>
        <h3 className="mt-2 font-display text-2xl text-emerald-950">Sprawdz oferte noclegow w {city}</h3>
        <p className="mt-2 text-sm text-emerald-900/72">
          Mapa hoteli pojawi sie tutaj po skonfigurowaniu Stay22 (klucz NEXT_PUBLIC_STAY22_AID).
        </p>
        <a
          href={`https://www.booking.com/searchresults.pl.html?ss=${encodeURIComponent(`${city}, ${country}`)}`}
          target="_blank"
          rel="noopener nofollow sponsored"
          className="mt-3 inline-block rounded-full bg-emerald-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-800"
        >
          Zobacz hotele na Booking.com
        </a>
        <div className="mt-3">
          <AffiliateDisclosure inline />
        </div>
      </div>
    );
  }

  // Stay22 oficjalny URL z dokumentacji /embed/gm — otwarty standalone w nowej karcie
  // pokazuje pelnoekranowa mape z hotelami (Booking, Airbnb, Vrbo, Hostelworld) z naszym AID.
  const params = new URLSearchParams({ aid, address: `${city}, ${country}` });
  if (campaign) params.set("campaign", campaign);
  if (checkin) params.set("checkin", checkin);
  if (checkout) params.set("checkout", checkout);
  const stay22Url = `https://www.stay22.com/embed/gm?${params.toString()}`;

  return (
    <div className="rounded-[1.6rem] border border-emerald-900/10 bg-[linear-gradient(135deg,#fef3c7_0%,#fde68a_100%)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-800">Hotele i noclegi</p>
          <h3 className="mt-1 font-display text-2xl text-amber-950">
            Mapa hoteli w {city} — Booking, Airbnb, Vrbo
          </h3>
          <p className="mt-2 text-sm leading-7 text-amber-900/85">
            Interaktywna mapa od Stay22 pokazuje noclegi z czterech serwisow naraz: Booking.com, Airbnb, Vrbo i Hostelworld.
            Porownujesz cene i lokalizacje w jednym miejscu, bez przeskakiwania miedzy zakladkami.
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <a
          href={stay22Url}
          target="_blank"
          rel="noopener nofollow sponsored"
          className="rounded-full bg-amber-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-amber-800"
        >
          Otworz mape hoteli — {city}
        </a>
        <span className="text-[10px] uppercase tracking-[0.18em] text-amber-800/70">Linki partnerskie</span>
      </div>
    </div>
  );
}
