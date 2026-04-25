import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "HelpTravel - Loty + hotel i plan wyjazdu w 3 minuty";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// OG image dla social share + Google: 1200x630, brand-spojny.
// Generowany dynamicznie - automatycznie aktualizuje sie przy zmianie tagline.
export default async function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #064E3B 0%, #0F766E 50%, #1E3A8A 100%)",
          padding: "60px",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 200,
            height: 200,
            borderRadius: "50%",
            background: "linear-gradient(180deg, #DBEAFE 0%, #93C5FD 60%, #60A5FA 100%)",
            border: "8px solid #22C55E",
            marginBottom: 32,
          }}
        >
          <div
            style={{
              fontSize: 120,
              lineHeight: 1,
              transform: "rotate(-25deg)",
              color: "#1E3A8A",
              textShadow: "0 0 6px #FFFFFF, 0 0 6px #FFFFFF",
              fontWeight: 900,
            }}
          >
            ✈
          </div>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 92,
            fontWeight: 900,
            letterSpacing: "-2px",
            marginBottom: 24,
          }}
        >
          <span style={{ color: "#FFFFFF" }}>HELP</span>
          <span style={{ color: "#34D399" }}>TRAVEL</span>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 36,
            color: "#FCD34D",
            fontWeight: 700,
            textAlign: "center",
          }}
        >
          Lot + hotel + plan wyjazdu w 3 minuty
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 26,
            color: "#A7F3D0",
            marginTop: 12,
            fontWeight: 500,
          }}
        >
          22 lotniska PL i EU · Bez rejestracji · 100% darmowe
        </div>
      </div>
    ),
    size,
  );
}
