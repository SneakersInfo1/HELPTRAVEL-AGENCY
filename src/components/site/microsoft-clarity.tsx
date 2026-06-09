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
import { useEffect } from "react";

import { useConsent } from "@/lib/consent/context";

declare global {
  interface Window {
    clarity?: (...args: unknown[]) => void;
  }
}

const FALLBACK_PROJECT_ID = "x4fhe37jyv";

export function MicrosoftClarity() {
  const { decision } = useConsent();
  const projectId = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID?.trim() || FALLBACK_PROJECT_ID;
  const analyticsAllowed = Boolean(projectId) && decision.analytics;

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
