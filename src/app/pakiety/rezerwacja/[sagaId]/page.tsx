// Potwierdzenie pakietu — jedna strona, DWA numery rezerwacji (spec §4).
// Ticketing bywa asynchroniczny: stan FLIGHT_BOOKED = „wystawiamy bilety"
// z odświeżaniem; CONFIRMED = komplet. Stany kompensacyjne pokazywane
// uczciwie (zwrot w drodze / finalizujemy ręcznie).

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PackageConfirmation } from "./_components/package-confirmation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Twoja rezerwacja pakietu", robots: { index: false, follow: false } };

export default async function PackageBookingPage({ params }: { params: Promise<{ sagaId: string }> }) {
  if (process.env.NEXT_PUBLIC_FEATURE_PACKAGES !== "true") notFound();
  const { sagaId } = await params;
  return (
    <main className="min-h-screen bg-neutral-50/60">
      <PackageConfirmation sagaId={sagaId} />
    </main>
  );
}
