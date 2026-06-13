// /loty/potwierdzenie/[bookingId] — strona potwierdzenia lotu (Faza 3.5).
// Server shell przekazuje bookingId do klienta, który pobiera świeży status
// (GET /api/flights/booking/[bookingId] — odświeża ticketingStatus live).

import type { Metadata } from "next";

import { FlightConfirmation } from "./_components/flight-confirmation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Potwierdzenie rezerwacji lotu | HelpTravel",
  robots: { index: false, follow: false },
};

export default async function FlightConfirmationPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  return <FlightConfirmation bookingId={bookingId} />;
}
