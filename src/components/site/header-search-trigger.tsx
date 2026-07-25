"use client";

// Kompaktowe wyszukiwanie w przyklejonym nagłówku (wzorzec Booking.com:
// „szukaj z każdego miejsca strony").
//
// Świadomie NIE duplikuje formularza w nagłówku: pasek wyszukiwania ma pięć
// pól w trybie lotów i własne popovery (kalendarz, goście, autouzupełnianie).
// Druga instancja oznaczałaby drugi stan, drugie eventy GA4 i dwa miejsca do
// utrzymania — a na mobile i tak nie zmieściłaby się w nagłówku. Zamiast tego
// przycisk wraca do JEDNEJ, dopracowanej wyszukiwarki i ustawia w niej fokus.
//
// Widoczny dopiero po minięciu hero: dopóki formularz jest na ekranie, drugi
// przycisk „szukaj" tylko konkurowałby z nim o uwagę.

import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";

import { track } from "@/lib/analytics/track";
import { cn } from "@/lib/ui/cn";

/** Po ilu pikselach scrolla uznajemy, że hero jest już poza ekranem. */
const REVEAL_AFTER_PX = 480;

export function HeaderSearchTrigger({
  label,
  isHome,
  compact = false,
}: {
  label: string;
  /** Poza stroną główną hero nie istnieje — przycisk jest wtedy zbędny. */
  isHome: boolean;
  /** Mobile: sama ikona (nagłówek nie mieści etykiety obok hamburgera). */
  compact?: boolean;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isHome) return;
    const onScroll = () => setVisible(window.scrollY > REVEAL_AFTER_PX);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isHome]);

  const onClick = useCallback(() => {
    track("sticky_search_used", { page_path: window.location.pathname });
    const hero = document.getElementById("hero");
    hero?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
    });
    // Fokus na pierwsze pole PO dojechaniu — inaczej przeglądarka przerywa
    // płynne przewijanie skokiem do elementu.
    window.setTimeout(() => {
      document
        .querySelector<HTMLInputElement>('[role="tabpanel"] input[type="text"]')
        ?.focus();
    }, 650);
  }, []);

  if (!isHome || !visible) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-line bg-surface-raised text-sm font-semibold text-ink shadow-sm transition hover:bg-surface-sunken",
        // 44×44 to minimalny cel dotykowy (WCAG 2.5.8 / wymóg z briefu) —
        // wariant kompaktowy jest kwadratem, pełny trzyma tę samą wysokość.
        compact ? "h-11 w-11 justify-center" : "h-11 px-4",
      )}
    >
      <Search aria-hidden className="h-4 w-4 shrink-0" strokeWidth={2} />
      {!compact && <span>{label}</span>}
    </button>
  );
}
