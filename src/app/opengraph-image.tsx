import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "HelpTravel - planer wyjazdow";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage() {
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
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 28, fontWeight: 700 }}>
          <span>HelpTravel</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.05 }}>
            Planer wyjazdow, ktory dopasuje kierunek do Ciebie.
          </div>
          <div style={{ fontSize: 28, opacity: 0.85 }}>
            Loty, hotele, atrakcje i scenariusze podrozy w jednym miejscu.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
