"use client";

// Google Analytics 4 with Consent Mode v2 — RODO compliant.
//
// Loading strategy: gtag.js is loaded ONLY after the user explicitly opts in
// to `analytics` in the cookie consent banner. While analytics is denied,
// zero network requests are sent to Google. This is stricter than what
// Consent Mode v2 strictly requires (which allows loading gtag with
// "default denied" and pinging consent-aware events), but it minimises the
// surface area for false-positive cookie scans and aligns with the
// "data minimisation" principle of art. 5 ust. 1 lit. c RODO.
//
// Page-view tracking uses the App Router pattern: we listen to pathname
// changes via `usePathname()` and fire a manual `page_view` event. The GA
// config sets `send_page_view: false` so the script does not double-fire.
//
// Required environment:
//   • NEXT_PUBLIC_GA_MEASUREMENT_ID — your GA4 property ID (G-XXXXXXXXXX).
//     If unset, the component renders nothing — no errors, no calls.

import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";

import { useConsent } from "@/lib/consent/context";

declare global {
  interface Window {
    dataLayer?: unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gtag?: (...args: any[]) => void;
  }
}

function PageViewTracker({ measurementId }: { measurementId: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.gtag !== "function") return;
    const query = searchParams?.toString();
    const path = query ? `${pathname}?${query}` : pathname;
    window.gtag("event", "page_view", {
      page_path: path,
      page_location: window.location.href,
      page_title: document.title,
      send_to: measurementId,
    });
  }, [pathname, searchParams, measurementId]);

  return null;
}

export function GoogleAnalytics() {
  const { decision } = useConsent();
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();

  // Track whether we ever loaded gtag for this session — if the user
  // withdraws analytics consent after loading, we cannot unload the script
  // (Next.js Script doesn't tear it down), but we can call gtag('consent',
  // 'update', { analytics_storage: 'denied' }) so no further events fire.
  const wasEverEnabledRef = useRef(false);

  const analyticsAllowed = Boolean(measurementId) && decision.analytics;

  if (analyticsAllowed) {
    wasEverEnabledRef.current = true;
  }

  // If user withdraws consent after gtag loaded, signal denial to GA.
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.gtag !== "function") return;
    if (wasEverEnabledRef.current && !decision.analytics) {
      window.gtag("consent", "update", {
        analytics_storage: "denied",
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
      });
    } else if (wasEverEnabledRef.current && decision.analytics) {
      window.gtag("consent", "update", {
        analytics_storage: "granted",
        ad_storage: decision.marketing ? "granted" : "denied",
        ad_user_data: decision.marketing ? "granted" : "denied",
        ad_personalization: decision.marketing ? "granted" : "denied",
      });
    }
  }, [decision.analytics, decision.marketing]);

  if (!analyticsAllowed || !measurementId) return null;

  return (
    <>
      {/* Loader — afterInteractive so it doesn't block paint. */}
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
      {/* Init — Consent Mode v2 with analytics granted (since we only render
          this component when consent is granted) and ads denied by default
          (unless user also opted in to marketing). IP anonymisation on. */}
      <Script id="ga-init" strategy="afterInteractive">{`
        window.dataLayer = window.dataLayer || [];
        function gtag(){window.dataLayer.push(arguments);}
        window.gtag = gtag;
        gtag('js', new Date());
        gtag('consent', 'default', {
          'analytics_storage': 'granted',
          'ad_storage': '${decision.marketing ? "granted" : "denied"}',
          'ad_user_data': '${decision.marketing ? "granted" : "denied"}',
          'ad_personalization': '${decision.marketing ? "granted" : "denied"}',
          'wait_for_update': 500
        });
        gtag('config', '${measurementId}', {
          anonymize_ip: true,
          send_page_view: false
        });
      `}</Script>
      {/* Page-view tracker. Wrapped in <Suspense> because useSearchParams()
          requires it in App Router. */}
      <Suspense fallback={null}>
        <PageViewTracker measurementId={measurementId} />
      </Suspense>
    </>
  );
}
