"use client";

// Microsoft Clarity — session recordings + heatmaps, RODO-compliant.
//
// Same consent model as GoogleAnalytics: the Clarity tag loads ONLY after the
// user opts in to `analytics` in the cookie banner. Until then, zero requests
// to clarity.ms. We use it to diagnose drop-off in the booking/payment funnel
// (filter recordings to `/hotele/rezerwacja` in the Clarity dashboard).
//
// PCI-safe: card data is entered inside a Stripe-hosted iframe, which Clarity
// cannot record (cross-origin), and Clarity masks sensitive text by default.
//
// Project id: NEXT_PUBLIC_CLARITY_PROJECT_ID (falls back to the live id so it
// works out-of-the-box; set the env var in Vercel to override).

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { useConsent } from "@/lib/consent/context";

declare global {
  interface Window {
    clarity?: (...args: unknown[]) => void;
  }
}

const FALLBACK_PROJECT_ID = "x4fhe37jyv";

/**
 * Trasy, na których nagrywanie sesji jest WYŁĄCZONE.
 *
 * POWÓD (audyt prywatności PR #2A, 2026-09-19): Clarity czyta adres strony
 * SAM, z `document.location`, i zapisuje go przy nagraniu. Na stronach powrotu
 * z płatności adres niesie parametry Stripe'a — w tym
 * `payment_intent_client_secret`, czyli poświadczenie — oraz `sid`, klucz
 * naszej sesji rezerwacji w Redisie. Nagranie utrwalałoby je u dostawcy
 * zewnętrznego.
 *
 * DLACZEGO BRAMKA, A NIE SAMO CZYSZCZENIE ADRESU. `StripPaymentSecrets`
 * wycina sekret z paska adresu, ale robi to w efekcie Reacta, a Clarity
 * wchodzi przez `next/script` — czyli o kolejności decyduje harmonogram
 * przeglądarki, nie nasz kod. Na kolejności efektów przejechaliśmy się w tym
 * samym PR-ze przy `page_view` (incydent 2026-09-18), więc poświadczenia nie
 * powierzamy wyścigowi. Brak komponentu = brak tagu = zero możliwości wysyłki,
 * niezależnie od czasu. `sid` ZOSTAJE w adresie (czyta go strona powrotu),
 * więc samo czyszczenie i tak by nie wystarczyło.
 *
 * Koszt: tracimy nagrania z dwóch ekranów końcowych. Diagnostyka lejka
 * zakupowego (`/hotele/rezerwacja`) zostaje nietknięta — to tam Clarity
 * zarabia na siebie, i tam w adresie nie ma żadnego poświadczenia.
 */
const TRASY_BEZ_NAGRYWANIA = ["/hotele/rezerwacja/return", "/loty/platnosc/return"] as const;

function czyTrasaWrazliwa(pathname: string | null): boolean {
  if (!pathname) return false;
  return TRASY_BEZ_NAGRYWANIA.some((t) => pathname === t || pathname.startsWith(`${t}/`));
}

export function MicrosoftClarity() {
  const { decision } = useConsent();
  const pathname = usePathname();
  const projectId = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID?.trim() || FALLBACK_PROJECT_ID;
  const analyticsAllowed =
    Boolean(projectId) && decision.analytics && !czyTrasaWrazliwa(pathname);

  // Sync consent changes to Clarity's consent API. No-op until the tag is
  // loaded (window.clarity undefined), so this safely covers both "never
  // consented" and "consent withdrawn after load" without tracking a flag.
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.clarity !== "function") return;
    window.clarity("consent", decision.analytics);
  }, [decision.analytics]);

  if (!analyticsAllowed) return null;

  return (
    <Script id="ms-clarity" strategy="afterInteractive">{`
      (function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
      })(window, document, "clarity", "script", "${projectId}");
      window.clarity && window.clarity("consent");
    `}</Script>
  );
}
