import { ImageResponse } from "next/og";

import { getComparisonPairBySlug } from "@/lib/mvp/comparisons";
import { getAllDestinationProfiles } from "@/lib/mvp/destinations";

export const runtime = "nodejs";
export const alt = "Porownanie kierunkow - HelpTravel";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage({ params }: { params: { para: string } }) {
  const pair = getComparisonPairBySlug(params.para);
  const destinations = getAllDestinationProfiles();
  const a = pair ? destinations.find((d) => d.slug === pair.a) : undefined;
  const b = pair ? destinations.find((d) => d.slug === pair.b) : undefined;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "64px",
          background: "linear-gradient(135deg, #064e3b 0%, #047857 50%, #10b981 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 26, fontWeight: 700, opacity: 0.9 }}>
          <span>HelpTravel</span>
          <span style={{ opacity: 0.6 }}>/</span>
          <span style={{ opacity: 0.8 }}>porownanie</span>
        </div>

        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", gap: 40, marginTop: 32 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              flex: 1,
              padding: 40,
              background: "rgba(255,255,255,0.12)",
              borderRadius: 24,
            }}
          >
            <div style={{ fontSize: 22, opacity: 0.8, textTransform: "uppercase", letterSpacing: 3 }}>
              {a?.country ?? ""}
            </div>
            <div style={{ fontSize: 64, fontWeight: 800, marginTop: 12, textAlign: "center", lineHeight: 1 }}>
              {a?.city ?? "Kierunek A"}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 48,
              fontWeight: 800,
              opacity: 0.85,
            }}
          >
            VS
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              flex: 1,
              padding: 40,
              background: "rgba(255,255,255,0.12)",
              borderRadius: 24,
            }}
          >
            <div style={{ fontSize: 22, opacity: 0.8, textTransform: "uppercase", letterSpacing: 3 }}>
              {b?.country ?? ""}
            </div>
            <div style={{ fontSize: 64, fontWeight: 800, marginTop: 12, textAlign: "center", lineHeight: 1 }}>
              {b?.city ?? "Kierunek B"}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", marginTop: 24, fontSize: 22, opacity: 0.85 }}>
          Konkretne porownanie pod realna decyzje wyjazdowa.
        </div>
      </div>
    ),
    size,
  );
}
