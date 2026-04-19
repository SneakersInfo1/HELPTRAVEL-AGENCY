import { ImageResponse } from "next/og";

import { seasonInflected, seasonSlugs, type Season } from "@/lib/mvp/months";

export const runtime = "nodejs";
export const alt = "Najlepsze kierunki na sezon - HelpTravel";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const seasonGradients: Record<Season, string> = {
  wiosna: "linear-gradient(135deg, #15803d 0%, #84cc16 50%, #fde047 100%)",
  lato: "linear-gradient(135deg, #ea580c 0%, #fb923c 50%, #fde047 100%)",
  jesien: "linear-gradient(135deg, #7c2d12 0%, #c2410c 50%, #f59e0b 100%)",
  zima: "linear-gradient(135deg, #1e3a8a 0%, #3b82f6 50%, #93c5fd 100%)",
};

const seasonHeroes: Record<Season, string> = {
  wiosna: "Sezon na ciepliejsze poludnie Europy bez tlumow",
  lato: "Pelnia plazy i komfortowa temperatura w celu",
  jesien: "Cieple kierunki bez kolejek i za rozsadne pieniadze",
  zima: "Ucieczki w cieplo i atmosferyczne city breaki",
};

function isSeason(value: string): value is Season {
  return (seasonSlugs as readonly string[]).includes(value);
}

export default async function OgImage({ params }: { params: { sezon: string } }) {
  const isValid = isSeason(params.sezon);
  const sezon = isValid ? (params.sezon as Season) : "lato";
  const gradient = seasonGradients[sezon];

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
          background: gradient,
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 26, fontWeight: 700, opacity: 0.95 }}>
          <span>HelpTravel</span>
          <span style={{ opacity: 0.7 }}>/</span>
          <span style={{ opacity: 0.85 }}>najlepsze kierunki</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 30, opacity: 0.92, textTransform: "uppercase", letterSpacing: 5 }}>
            Ranking na {seasonInflected[sezon]}
          </div>
          <div style={{ fontSize: 96, fontWeight: 800, lineHeight: 0.95 }}>
            Najlepsze kierunki na {seasonInflected[sezon]} 2026
          </div>
          <div style={{ fontSize: 28, opacity: 0.92, marginTop: 12 }}>{seasonHeroes[sezon]}</div>
        </div>
      </div>
    ),
    size,
  );
}
