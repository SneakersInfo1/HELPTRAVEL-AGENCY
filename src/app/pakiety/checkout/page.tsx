// Checkout pakietu Lot + Hotel (Faza 2, Krok 2.1) — DWA odrębne checkouty
// (§4): Dane podróżnych → Checkout 1/2 Hotel → Checkout 2/2 Lot. Za flagą,
// noindex (krok flow). Kontekst oferty z query (z kroku 2 /pakiety/oferta);
// wznowienie po płatności: ?saga=…&step=….

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PackageCheckout } from "./_components/package-checkout";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Rezerwacja pakietu Lot + Hotel",
  robots: { index: false, follow: false },
};

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function PackageCheckoutPage({ searchParams }: { searchParams: Promise<SP> }) {
  if (process.env.NEXT_PUBLIC_FEATURE_PACKAGES !== "true") notFound();
  const sp = await searchParams;

  return (
    <main className="min-h-screen bg-neutral-50/60">
      <PackageCheckout
        resume={{ sagaId: one(sp.saga) ?? null, step: one(sp.step) ?? null }}
        offer={{
          destination: one(sp.destination) ?? "",
          hotelId: one(sp.hotelId) ?? "",
          hotelName: one(sp.hotelName) ?? "",
          rateId: one(sp.rateId) ?? "",
          flightOfferId: one(sp.flightOfferId) ?? "",
          dateFrom: one(sp.dateFrom) ?? "",
          dateTo: one(sp.dateTo) ?? "",
          adults: Math.max(1, Math.min(9, Number.parseInt(one(sp.adults) ?? "2", 10) || 2)),
          hotelPln: Number.parseFloat(one(sp.hotelPln) ?? "") || 0,
          flightPln: Number.parseFloat(one(sp.flightPln) ?? "") || 0,
        }}
      />
    </main>
  );
}
