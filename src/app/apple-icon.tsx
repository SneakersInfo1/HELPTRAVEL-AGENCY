import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Apple touch icon - generowany dynamicznie z brand colors,
// zsynchronizowany z helptravel-mark.svg.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1E3A8A",
          borderRadius: "32px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 152,
            height: 152,
            borderRadius: "50%",
            background: "linear-gradient(180deg, #DBEAFE 0%, #93C5FD 60%, #60A5FA 100%)",
            border: "5px solid #22C55E",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              fontSize: 88,
              lineHeight: 1,
              transform: "rotate(-25deg)",
              color: "#1E3A8A",
              textShadow: "0 0 4px #FFFFFF, 0 0 4px #FFFFFF, 0 0 4px #FFFFFF",
              fontWeight: 900,
            }}
          >
            ✈
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
