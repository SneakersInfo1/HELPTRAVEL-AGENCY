"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="pl">
      <body
        style={{
          fontFamily: "system-ui, -apple-system, sans-serif",
          background: "linear-gradient(135deg, #ecfdf5 0%, #ffffff 100%)",
          minHeight: "100vh",
          margin: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "48px 24px",
        }}
      >
        <main style={{ maxWidth: 640, textAlign: "center" }}>
          <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.22em", textTransform: "uppercase", color: "#dc2626" }}>
            Krytyczny blad
          </p>
          <h1 style={{ fontSize: 48, lineHeight: 1.05, color: "#022c22", margin: "16px 0", fontWeight: 700 }}>
            Cos poszlo bardzo nie tak.
          </h1>
          <p style={{ fontSize: 16, lineHeight: 1.6, color: "#064e3b" }}>
            Strona nie moze sie zaladowac. Odswiez przegladarke. Jesli to nie pomoze, sprobuj za chwile.
          </p>
          {error.digest ? (
            <p style={{ fontSize: 12, color: "#6b7280", marginTop: 16 }}>ID bledu: {error.digest}</p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 24,
              padding: "12px 24px",
              borderRadius: 999,
              background: "#047857",
              color: "white",
              border: "none",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Sprobuj ponownie
          </button>
        </main>
      </body>
    </html>
  );
}
