"use client";

// Link ze strony treściowej (SEO) w lejek produktowy — z pomiarem.
//
// POWÓD ISTNIENIA: strony treściowe (miesiące, przewodniki, porównania,
// inspiracje, huby) to komponenty SERWEROWE, więc nie mogą wołać `track()`.
// Do tej pory każdy klik z treści do wyszukiwarki był niewidoczny: żaden
// event nie leciał, bo linki treściowe prowadzą prosto do `/hotele/szukaj`,
// czyli NIE przechodzą przez formularz i `hotel_search_submit` się nie odpala.
// Audyt GA4 (wrzesień 2026) pokazał to jako dziurę nr 1: 197 kliknięć na
// porównaniach w 3 miesiące, a zero wiedzy, czy ktokolwiek poszedł dalej.
//
// Komponent jest CELOWO cienki: renderuje zwykły `next/link`, nie narzuca
// żadnych klas ani stylów i przekazuje `className` na wylot. Strona treściowa
// zmienia więc tylko nazwę znacznika, a nie wygląd — to jest zmiana
// pomiarowa, nie wizualna.
//
// KLIK LICZY SIĘ RAZ. Handler siedzi na `<Link>`, więc niezależnie od tego,
// w co dokładnie trafił kursor (tekst, ikona, span w środku), zdarzenie leci
// dokładnie jeden raz — przeglądarka odpala `onClick` linku raz na kliknięcie,
// a bąbelkowanie z potomków kończy się na tym samym handlerze.

import Link from "next/link";
import { useCallback } from "react";

import { LocalizedLink } from "@/components/site/localized-link";
import { analyticsPagePath, currentAnalyticsPagePath } from "@/lib/analytics/page-path";
import { track, type TrackEventMap } from "@/lib/analytics/track";

type SeoCtaParams = TrackEventMap["seo_cta_click"];

export interface SeoCtaLinkProps {
  href: string;
  typTresci: SeoCtaParams["content_type"];
  ctaType: SeoCtaParams["cta_type"];
  destinationSlug?: string;
  month?: string;
  /**
   * Renderuj `LocalizedLink` zamiast gołego `next/link`.
   *
   * Przewodniki kierunków linkują przez `LocalizedLink`, bo ich adresy
   * przechodzą przez `localizeHref`. Gdyby ten komponent zawsze renderował
   * `next/link`, dodanie pomiaru po cichu zmieniłoby ADRES docelowy — a to
   * już nie jest zmiana analityczna. Przełącznik zostawia każdej stronie jej
   * dotychczasową semantykę linku i dokłada wyłącznie zdarzenie.
   */
  localized?: boolean;
  className?: string;
  "aria-label"?: string;
  title?: string;
  prefetch?: boolean;
  children: React.ReactNode;
}

/**
 * Normalizuje cel linku do samej ścieżki.
 *
 * Adres bezwzględny (gdyby kiedyś się pojawił) traci host, a ścieżka i tak
 * przechodzi przez `analyticsPagePath`, więc obowiązują ją te same zasady
 * co ścieżce strony: jeden `?` i żadnych poświadczeń w parametrach.
 */
function sciezkaCelu(href: string): string {
  try {
    if (/^https?:\/\//i.test(href)) {
      const url = new URL(href);
      return analyticsPagePath(url.pathname, url.search);
    }
  } catch {
    // Niepoprawny adres — spada niżej, do obsługi ścieżki względnej.
  }
  const [sciezka, ...reszta] = href.split("?");
  return analyticsPagePath(sciezka, reszta.join("?"));
}

export function SeoCtaLink({
  href,
  typTresci,
  ctaType,
  destinationSlug,
  month,
  localized = false,
  children,
  ...rest
}: SeoCtaLinkProps) {
  const onClick = useCallback(() => {
    track("seo_cta_click", {
      source_path: currentAnalyticsPagePath(),
      destination_path: sciezkaCelu(href),
      content_type: typTresci,
      cta_type: ctaType,
      ...(destinationSlug ? { destination_slug: destinationSlug } : {}),
      ...(month ? { month } : {}),
    });
  }, [href, typTresci, ctaType, destinationSlug, month]);

  const Znacznik = localized ? LocalizedLink : Link;

  return (
    <Znacznik href={href} onClick={onClick} {...rest}>
      {children}
    </Znacznik>
  );
}
