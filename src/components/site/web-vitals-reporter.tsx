"use client";

import { useReportWebVitals } from "next/web-vitals";

import { useConsent } from "@/lib/consent/context";

export function WebVitalsReporter() {
  // RODO: Web Vitals are analytics ("aggregate usage metrics"). We MUST gate
  // the send behind explicit analytics consent. Until the user opts in,
  // useReportWebVitals still fires (it's wired to next/web-vitals) but the
  // handler short-circuits — nothing is sent to the server.
  const { decision } = useConsent();
  const analyticsAllowed = decision.analytics;

  useReportWebVitals((metric) => {
    if (!analyticsAllowed) return;

    const body = JSON.stringify({
      id: metric.id,
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      delta: metric.delta,
      navigationType: metric.navigationType,
      path: typeof window !== "undefined" ? window.location.pathname : "",
    });

    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon("/api/vitals", body);
    } else {
      fetch("/api/vitals", { body, method: "POST", keepalive: true }).catch(() => {});
    }
  });

  return null;
}
