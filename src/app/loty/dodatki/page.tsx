// /loty/dodatki — krok „Bagaż / taryfa" (Faza D, zadanie 5).
//
// Po wybraniu lotu na liście użytkownik wybiera TARYFĘ (branded fare: Basic/
// Smart/Go/Plus…) różniącą się bagażem i ceną. To realny mechanizm „dodania
// bagażu" w LiteAPI Flights (różne offerId tej samej trasy) — wybór po prostu
// przechodzi przez istniejący flow verify → płatność, bez ruszania ścieżki
// płatności. Wybór miejsc / bagaż à la carte (servicesAttachable) świadomie
// odłożone (Faza D2 — kontrakt attach→booking potwierdzany testem z kartą).

import type { Metadata } from "next";

import { FlightExtras } from "./_components/flight-extras";

export const metadata: Metadata = {
  title: "Bagaż i taryfa",
  robots: "noindex, nofollow",
};

export default function FlightExtrasPage() {
  return <FlightExtras />;
}
