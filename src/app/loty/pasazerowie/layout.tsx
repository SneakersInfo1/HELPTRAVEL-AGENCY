// /loty/pasazerowie — krok zakupu, nie strona do wyszukiwarki. Strona jest
// komponentem klienckim i nie może eksportować metadanych, więc noindex
// deklaruje ten layout. Bez niego dziedziczy `index, follow` z głównego layoutu
// (test K: src/lib/seo/purchase-flow-robots.test.ts). Bez `title`: tytuł-napis
// w layoucie kasuje szablon „%s | HelpTravel” podstron.

import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function FlightPassengersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
