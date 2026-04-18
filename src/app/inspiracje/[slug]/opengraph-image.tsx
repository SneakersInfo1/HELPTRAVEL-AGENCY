import { ImageResponse } from "next/og";

import { getEditorialArticleBySlug } from "@/lib/mvp/publisher-content";

export const runtime = "nodejs";
export const alt = "Inspiracja - HelpTravel";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage({ params }: { params: { slug: string } }) {
  const article = getEditorialArticleBySlug(params.slug);
  const title = article?.title ?? "Inspiracja";
  const excerpt = article?.excerpt ?? "Praktyczne scenariusze wyjazdow.";

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
            "linear-gradient(135deg, #052e16 0%, #065f46 60%, #10b981 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 26, fontWeight: 700, opacity: 0.9 }}>
          <span>HelpTravel</span>
          <span style={{ opacity: 0.6 }}>/</span>
          <span style={{ opacity: 0.8 }}>inspiracje</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.05 }}>{title}</div>
          <div style={{ fontSize: 28, opacity: 0.85, lineHeight: 1.4 }}>{excerpt}</div>
        </div>
      </div>
    ),
    size,
  );
}
