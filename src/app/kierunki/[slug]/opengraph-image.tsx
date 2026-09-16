import { ImageResponse } from "next/og";

import { curatedDestinations } from "@/lib/mvp/destinations";
import { getDestinationSeoFacts } from "@/lib/seo/destination-facts";

export const runtime = "nodejs";
export const alt = "Kierunek - HelpTravel";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage({ params }: { params: { slug: string } }) {
  const destination = curatedDestinations.find((item) => item.slug === params.slug);
  // Polska nazwa i kraj z bramki faktów — do 2026-09 obraz pokazywał „Lisbon, Portugal".
  const facts = destination ? getDestinationSeoFacts(destination) : null;
  const city = facts?.name ?? "Kierunek";
  const country = facts?.countryName ?? "";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          background:
            "linear-gradient(135deg, #064e3b 0%, #047857 50%, #10b981 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 26, fontWeight: 700, opacity: 0.9 }}>
          <span>HelpTravel</span>
          <span style={{ opacity: 0.6 }}>/</span>
          <span style={{ opacity: 0.8 }}>kierunki</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 28, opacity: 0.85, textTransform: "uppercase", letterSpacing: 4 }}>{country}</div>
          <div style={{ fontSize: 96, fontWeight: 800, lineHeight: 1 }}>{city}</div>
          <div style={{ fontSize: 26, opacity: 0.8, marginTop: 16 }}>
            Praktyczny przewodnik, koszty, najlepszy czas na wyjazd.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
