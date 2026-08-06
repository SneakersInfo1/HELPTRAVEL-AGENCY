"use client";

// Nawigacja po sekcjach strony hotelu (brief §11.3).
//
// Sticky na desktopie, przewijalna poziomo na mobile. Podświetla sekcję,
// która jest aktualnie na ekranie.
//
// DWIE rzeczy, które łatwo tu zepsuć i o które ten komponent dba:
//
// 1. **Przewijanie pod sticky nagłówkiem.** Zwykłe `scrollIntoView()` chowa
//    nagłówek sekcji za paskiem wyszukiwania (sticky, ~72–84 px) i za samym
//    paskiem zakładek. Dlatego liczymy offset ręcznie.
// 2. **Sekcje, których nie ma.** Hotel bez opinii nie może mieć zakładki
//    „Opinie" prowadzącej donikąd — renderujemy tylko te, których kotwice
//    faktycznie istnieją w DOM.

import { useEffect, useState } from "react";

interface TabDef {
  id: string;
  label: string;
}

const LABELS: Record<string, string> = {
  rooms: "Pokoje",
  amenities: "Udogodnienia",
  reviews: "Opinie",
  location: "Lokalizacja",
  policies: "Zasady",
};

// Wysokość sticky paska wyszukiwania + zapas na sam pasek zakładek.
// Mobile ma niższy nagłówek niż sm+ — patrz `page.tsx` (`top-[72px] sm:top-[84px]`).
const SCROLL_OFFSET_MOBILE = 132;
const SCROLL_OFFSET_DESKTOP = 148;

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
    .filter((id) => id in LABELS)
    .map((id) => ({ id, label: LABELS[id] }));

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
      // Górny margines odcina obszar pod sticky nagłówkiem, żeby sekcja
      // stawała się „aktywna" dopiero, gdy realnie widać jej początek.
      { rootMargin: "-140px 0px -60% 0px", threshold: 0 },
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
      className="sticky top-[72px] z-20 -mx-4 border-b border-neutral-200 bg-white/95 px-4 backdrop-blur sm:top-[84px] sm:mx-0 sm:rounded-t-2xl sm:px-2"
    >
      <ul className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {present.map((t) => {
          const isActive = active === t.id;
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => goTo(t.id)}
                aria-current={isActive ? "true" : undefined}
                className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? "border-emerald-700 text-emerald-800"
                    : "border-transparent text-neutral-600 hover:text-neutral-900"
                }`}
              >
                {t.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
