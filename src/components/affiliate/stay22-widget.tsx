"use client";

import Script from "next/script";

import { AffiliateDisclosure } from "./affiliate-disclosure";

interface Stay22WidgetProps {
  city: string;
  country: string;
  aid: string | null;
  campaign?: string;
  checkin?: string;
  checkout?: string;
  height?: number;
}

// Stay22 Allroad widget — interaktywna mapa z hotelami w danym miescie.
// Jesli AID nie jest skonfigurowany, pokazujemy fallback CTA do Bookinga.
export function Stay22Widget({ city, country, aid, campaign, checkin, checkout, height = 460 }: Stay22WidgetProps) {
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

  const params = new URLSearchParams({ aid, address: `${city}, ${country}` });
  if (campaign) params.set("campaign", campaign);
  if (checkin) params.set("checkin", checkin);
  if (checkout) params.set("checkout", checkout);

  const widgetUrl = `https://www.stay22.com/embed/gm?${params.toString()}`;

  return (
    <div className="rounded-[1.6rem] border border-emerald-900/10 bg-white/95 p-5 shadow-[0_12px_32px_rgba(16,84,48,0.05)]">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Hotele i noclegi</p>
          <h3 className="mt-1 font-display text-2xl text-emerald-950">Mapa hoteli — {city}</h3>
        </div>
        <AffiliateDisclosure inline />
      </div>
      <div className="mt-3 overflow-hidden rounded-xl border border-emerald-900/10">
        <iframe
          src={widgetUrl}
          title={`Mapa hoteli ${city}`}
          width="100%"
          height={height}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          style={{ border: 0, display: "block" }}
        />
      </div>
      {/* Stay22 SDK fallback dla zaawansowanych widgetow.
          Aktywuje sie tylko jesli kod widgetu na stronie korzysta z atrybutu data-allroad. */}
      <Script src="https://www.stay22.com/sdk/widget.js" strategy="lazyOnload" />
    </div>
  );
}
