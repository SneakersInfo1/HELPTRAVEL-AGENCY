// Układ bez zdjęcia. Gdy nie ma wiarygodnej fotografii kierunku, zamiast zdjęcia
// innego miejsca pokazujemy spokojną płaszczyznę w barwach marki.
//
// - tone="dark": pod białym tekstem nakładanym na zdjęcie (kafelki, hero) — nazwa
//   kierunku zostaje w istniejącym bloku tekstu, więc tu jej nie powtarzamy;
// - tone="light": karty bez tekstu na zdjęciu — nazwa kierunku szeryfem.
// Element jest dekoracyjny (aria-hidden): nazwa kierunku i tak stoi w treści karty.

export function PhotoPlaceholder({ label, tone = "dark" }: { label?: string; tone?: "dark" | "light" }) {
  const surface = tone === "dark" ? "bg-brand-strong text-white/75" : "bg-surface-sunken text-ink-muted";
  return (
    <div aria-hidden data-photo-placeholder="" className={`absolute inset-0 flex items-center justify-center p-4 text-center ${surface}`}>
      {label ? <span className="font-display text-2xl font-semibold leading-tight sm:text-3xl">{label}</span> : null}
    </div>
  );
}
