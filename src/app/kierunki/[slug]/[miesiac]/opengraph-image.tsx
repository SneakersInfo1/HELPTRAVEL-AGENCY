import { ImageResponse } from "next/og";

import { getAllDestinationProfiles } from "@/lib/mvp/destinations";
import {
  getMonthIndex,
  inMonthPhrase,
  isPolishMonthSlug,
} from "@/lib/mvp/months";
import { getDestinationSeoFacts, monthTemperature } from "@/lib/seo/destination-facts";

export const runtime = "nodejs";
export const alt = "Kierunek w danym miesiącu - HelpTravel";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage({ params }: { params: { slug: string; miesiac: string } }) {
  const destination = getAllDestinationProfiles().find((d) => d.slug === params.slug);
  if (!destination || !isPolishMonthSlug(params.miesiac)) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(135deg, #064e3b 0%, #10b981 100%)",
            color: "white",
            fontSize: 64,
            fontFamily: "sans-serif",
            fontWeight: 800,
          }}
        >
          HelpTravel
        </div>
      ),
      size,
    );
  }

  const monthIndex = getMonthIndex(params.miesiac);
  const inMonth = inMonthPhrase(params.miesiac);
  const facts = getDestinationSeoFacts(destination);
  const temp = monthTemperature(facts, monthIndex);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px",
          background: "linear-gradient(135deg, #064e3b 0%, #047857 50%, #10b981 100%)",
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
          <div style={{ fontSize: 28, opacity: 0.85, textTransform: "uppercase", letterSpacing: 4 }}>
            {facts.countryName} • wyjazd {inMonth}
          </div>
          <div style={{ fontSize: 84, fontWeight: 800, lineHeight: 1 }}>
            {facts.name} {inMonth}
          </div>
        </div>
        {temp !== null && (
          <div style={{ display: "flex", gap: 24 }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                padding: "20px 28px",
                background: "rgba(255,255,255,0.16)",
                borderRadius: 16,
              }}
            >
              <div style={{ fontSize: 18, opacity: 0.8, textTransform: "uppercase", letterSpacing: 2 }}>
                Pogoda
              </div>
              <div style={{ fontSize: 44, fontWeight: 800 }}>{temp}°C</div>
            </div>
          </div>
        )}
      </div>
    ),
    size,
  );
}
