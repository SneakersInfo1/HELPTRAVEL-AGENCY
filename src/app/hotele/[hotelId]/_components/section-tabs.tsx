"use client";

// Nawigacja po sekcjach strony hotelu.
//
// PASEK JEST STATYCZNY — i nie wolno go przykleić.
//
// Decyzja właściciela (2026-08-09), taka sama jak wcześniej dla paska kierunku
// na `/hotele/szukaj`: pasek ma istnieć w JEDNYM miejscu w przepływie
// dokumentu i naturalnie znikać nad krawędzią okna przy przewijaniu. Nie
// wraca, nie goni scrolla. Przyklejony zostaje wyłącznie nagłówek serwisu.
//
// Wcześniej było tu `sticky top-[72px] z-20`. Razem ze sticky nagłówkiem dawało
// to dwa paski jadące za treścią i zjadające górę ekranu na telefonie.
//
// DWIE rzeczy, o które ten komponent dba poza tym:
//
// 1. **Przewijanie pod sticky nagłówkiem.** Zwykłe `scrollIntoView()` chowa
//    nagłówek sekcji za paskiem wyszukiwania. Liczymy offset ręcznie —
//    ale już TYLKO na nagłówek, bo pasek zakładek nie jest przyklejony
//    i nie zasłania celu.
// 2. **Sekcje, których nie ma.** Hotel bez opinii nie może mieć zakładki
//    „Opinie" prowadzącej donikąd — renderujemy tylko te, których kotwice
//    faktycznie istnieją w DOM.

import { useEffect, useState } from "react";
import { BedDouble, MapPin, ShieldCheck, Sparkles, Star, type LucideIcon } from "lucide-react";

interface TabDef {
  id: string;
  label: string;
  Icon: LucideIcon;
}

const TABS: Record<string, { label: string; Icon: LucideIcon }> = {
  rooms: { label: "Pokoje", Icon: BedDouble },
  amenities: { label: "Udogodnienia", Icon: Sparkles },
  reviews: { label: "Opinie", Icon: Star },
  location: { label: "Lokalizacja", Icon: MapPin },
  policies: { label: "Zasady", Icon: ShieldCheck },
};

// Wysokość samego sticky paska wyszukiwania + oddech.
// Pasek zakładek NIE wchodzi już do tej sumy — jest statyczny, więc w chwili
// dojazdu do sekcji dawno go nad ekranem nie ma. Wcześniej doliczone 132/148
// zostawiało nad nagłówkiem sekcji pas martwej przestrzeni.
const SCROLL_OFFSET_MOBILE = 88;
const SCROLL_OFFSET_DESKTOP = 100;

/**
 * @param sectionIds kotwice sekcji, które strona FAKTYCZNIE wyrenderowała.
 *
 * Lista przychodzi z serwera, a nie z `document.getElementById` w efekcie.
 * Dwa powody: (a) serwer wie dokładnie, co wyrenderował — sprawdzanie DOM to
 * zgadywanie po fakcie, (b) `setState` w efekcie jest w tym projekcie błędem
 * lintu (React Compiler: „cascading renders").
 */
export function SectionTabs({ sectionIds }: { sectionIds: string[] }) {
  const [active, setActive] = useState<string | null>(null);

  const sectionKey = sectionIds.join(",");
  const present: TabDef[] = sectionIds
    .filter((id) => id in TABS)
    .map((id) => ({ id, label: TABS[id].label, Icon: TABS[id].Icon }));

  // Podświetlenie aktywnej sekcji. IntersectionObserver zamiast nasłuchu
  // `scroll` — nie odpala się przy każdym pikselu przewinięcia.
  useEffect(() => {
    // Identyfikatory odtwarzamy WEWNĄTRZ efektu z `sectionKey`, zamiast
    // domykać `present` (liczone przy każdym renderze) — dzięki temu lista
    // zależności jest kompletna i obserwator nie przepina się bez powodu.
    const ids = sectionKey.split(",").filter(Boolean);
    if (ids.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      // Margines odcina obszar pod sticky NAGŁÓWKIEM (nie pod zakładkami —
      // te już nie są przyklejone), żeby sekcja stawała się „aktywna"
      // dopiero, gdy realnie widać jej początek.
      { rootMargin: "-100px 0px -60% 0px", threshold: 0 },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sectionKey]);

  const goTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const offset = window.innerWidth >= 640 ? SCROLL_OFFSET_DESKTOP : SCROLL_OFFSET_MOBILE;
    const top = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({
      top,
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
    setActive(id);
  };

  // Mniej niż dwie sekcje = nawigacja bez sensu.
  if (present.length < 2) return null;

  return (
    <nav
      aria-label="Sekcje strony hotelu"
      data-ht="hotel-tabs"
      // BEZ `sticky`, BEZ `fixed`, BEZ `z-*`. Zwykły blok w przepływie.
      // Zaokrąglona obudowa z delikatną ramką i cieniem — ma wyglądać jak
      // element sterujący, a nie jak kreska pod treścią.
      className="rounded-2xl border border-neutral-200 bg-white p-1.5 shadow-sm"
    >
      {/* Przewijanie poziome zamknięte W PASKU, nie w stronie — bez tego
          pięć zakładek z ikonami wypychało `document` w poziomie na 360 px. */}
      <ul className="flex gap-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {present.map(({ id, label, Icon }) => {
          const isActive = active === id;
          return (
            <li key={id} className="shrink-0">
              <button
                type="button"
                onClick={() => goTo(id)}
                aria-current={isActive ? "true" : undefined}
                // min-h-11 = 44 px — minimalny cel dotyku (WCAG 2.2 AA).
                className={`inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-xl px-3.5 text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-1 motion-reduce:transition-none ${
                  isActive
                    ? "bg-emerald-700 text-white shadow-sm"
                    : "text-neutral-700 hover:bg-emerald-50 hover:text-emerald-800"
                }`}
              >
                <Icon
                  aria-hidden
                  className={`h-4 w-4 shrink-0 ${isActive ? "text-white" : "text-emerald-700/70"}`}
                  strokeWidth={2}
                />
                {label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
