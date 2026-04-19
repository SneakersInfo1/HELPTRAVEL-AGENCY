import { ImageResponse } from "next/og";

import { getAllDestinationProfiles } from "@/lib/mvp/destinations";
import {
  getMonthIndex,
  isPolishMonthSlug,
  polishMonthInflected,
} from "@/lib/mvp/months";

export const runtime = "nodejs";
export const alt = "Kierunek w danym miesiacu - HelpTravel";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function estimateBudget(costIndex: number, flightHours: number, monthIndex: number) {
  const days = 4;
  const travelers = 2;
  const peakMonths = [5, 6, 7];
  const seasonal = peakMonths.includes(monthIndex) ? 1.18 : monthIndex === 11 || monthIndex === 0 ? 1.06 : 0.96;
  const flight = (380 + flightHours * 70) * seasonal;
  const stay = 170 * costIndex * (peakMonths.includes(monthIndex) ? 1.12 : 1);
  const local = 65 * costIndex;
  const total = travelers * flight + travelers * days * stay + days * local;
  return { min: Math.round(total * 0.9), max: Math.round(total * 1.18) };
}

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
  const monthInfl = polishMonthInflected[params.miesiac];
  const temp = destination.avgTempByMonth[monthIndex];
  const budget = estimateBudget(destination.costIndex, destination.typicalFlightHoursFromPL, monthIndex);

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
            {destination.country} • wyjazd w {monthInfl}
          </div>
          <div style={{ fontSize: 84, fontWeight: 800, lineHeight: 1 }}>
            {destination.city} w {monthInfl}
          </div>
        </div>
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
            <div style={{ fontSize: 18, opacity: 0.8, textTransform: "uppercase", letterSpacing: 2 }}>Pogoda</div>
            <div style={{ fontSize: 44, fontWeight: 800 }}>{temp}°C</div>
          </div>
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
              Budzet 2 os / 4 dni
            </div>
            <div style={{ fontSize: 36, fontWeight: 800 }}>
              {budget.min.toLocaleString("pl-PL")}-{budget.max.toLocaleString("pl-PL")} PLN
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
