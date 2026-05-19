// /hotele/rezerwacja — guest-data form + LiteAPI Payment SDK widget.
// Server component: resolves the booking flag + hotel name, then hands off to
// the client form. Entry is already gated on the rooms CTA; this re-checks the
// flag server-side as defense-in-depth (NON-NEGOTIABLE RULE 3 / Phase 3.1).

import type { Metadata } from "next";
import Link from "next/link";

import { isBookingLive } from "@/lib/config/featureFlags";
import { getHotelDetail } from "@/lib/liteapi";
import { getSiteUrl } from "@/lib/mvp/site";

import { ReservationForm } from "./_components/reservation-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Rezerwacja | HelpTravel",
  robots: { index: false, follow: false },
};

interface SP {
  hotelId?: string;
  offerId?: string;
  checkin?: string;
  checkout?: string;
  adults?: string;
  price?: string;
  cur?: string;
  board?: string;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-neutral-50">
      <section className="mx-auto max-w-2xl px-4 py-16">
        <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center">
          <h1 className="text-xl font-bold text-neutral-900">{title}</h1>
          <div className="mt-3 text-sm text-neutral-600">{children}</div>
          <Link
            href="/hotele"
            className="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Wróć do wyszukiwania
          </Link>
        </div>
      </section>
    </main>
  );
}

export default async function ReservationPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  if (!isBookingLive()) {
    return (
      <Panel title="Rezerwacja online — wkrótce dostępne">
        Pracujemy nad płatnościami online. W międzyczasie napisz do nas, a
        pomożemy dokończyć rezerwację.
      </Panel>
    );
  }

  const sp = await searchParams;
  const hotelId = sp.hotelId?.trim();
  const offerId = sp.offerId?.trim();
  const checkin = sp.checkin && /^\d{4}-\d{2}-\d{2}$/.test(sp.checkin) ? sp.checkin : null;
  const checkout =
    sp.checkout && /^\d{4}-\d{2}-\d{2}$/.test(sp.checkout) ? sp.checkout : null;

  if (!hotelId || !offerId || !checkin || !checkout) {
    return (
      <Panel title="Brakuje danych oferty">
        Link rezerwacji jest niekompletny. Wybierz ofertę ponownie na stronie
        hotelu.
      </Panel>
    );
  }

  let hotelName = "Wybrany hotel";
  let hotelCity: string | undefined;
  try {
    const detail = await getHotelDetail(hotelId);
    if (detail) {
      hotelName = detail.name;
      hotelCity = detail.city;
    }
  } catch {
    /* non-fatal — prebook uses offerId; name is display-only */
  }

  const price = sp.price ? Number(sp.price) : undefined;
  const currency = (sp.cur || "PLN").toUpperCase();
  const adults = sp.adults ? Math.max(1, Math.min(8, Number(sp.adults))) : 1;

  const publicKey = process.env.NEXT_PUBLIC_LITEAPI_PROD_PUBLIC_KEY ?? "";
  const returnBaseUrl = getSiteUrl();

  return (
    <main className="min-h-screen bg-neutral-50">
      <section className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-2xl font-bold text-neutral-900">Twoja rezerwacja</h1>
        <p className="mt-1 text-sm text-neutral-600">
          {hotelName}
          {hotelCity ? `, ${hotelCity}` : ""} · {checkin} → {checkout}
          {Number.isFinite(price) ? ` · ${Math.round(price as number)} ${currency}` : ""}
        </p>
        <ReservationForm
          offerId={offerId}
          hotelName={hotelName}
          hotelCity={hotelCity}
          checkin={checkin}
          checkout={checkout}
          price={Number.isFinite(price) ? (price as number) : undefined}
          currency={currency}
          board={sp.board}
          adults={adults}
          publicKey={publicKey}
          returnBaseUrl={returnBaseUrl}
        />
      </section>
    </main>
  );
}
