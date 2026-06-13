// Typed funnel-event tracker for GA4.
//
// Why this module exists: GA4 is wired in components/site/google-analytics.tsx
// (Consent Mode v2, loads gtag only after analytics opt-in). But until now we
// only fired automatic `page_view` events — no funnel visibility. You can't
// optimise a booking funnel you can't measure (SEO master plan P2-9).
//
// This wraps `window.gtag('event', ...)` with:
//   • SSR safety — no-op when `window` is undefined.
//   • Consent safety — no-op when gtag never loaded (analytics denied). We
//     don't re-check consent here; the GoogleAnalytics component only ever
//     defines window.gtag AFTER consent, so "gtag missing" == "no consent".
//   • A typed event catalogue so call sites can't typo event names or drop
//     required params. Each event maps 1:1 to a GA4 custom event you can
//     build funnels / conversions from in the GA4 UI.
//
// Usage (client components only — gtag lives in the browser):
//   import { track } from "@/lib/analytics/track";
//   track("hotel_card_click", { hotel_id, position, destination });
//
// To register conversions in GA4: mark `booking_complete` and
// `affiliate_click` as key events (Admin → Events → mark as key event).

type GtagFn = (command: "event", eventName: string, params?: Record<string, unknown>) => void;

interface WindowWithGtag {
  gtag?: GtagFn;
}

// ─── Event catalogue ─────────────────────────────────────────────────────
// Each key is a GA4 event name; the value type is its required+optional
// params. Keep names snake_case (GA4 convention) and ≤ 40 chars.

export interface TrackEventMap {
  // ── Search funnel ──
  hotel_search_submit: {
    destination: string;
    country?: string;
    checkin?: string;
    checkout?: string;
    /** SUM of adults+children (product decision: children count as adults). */
    adults?: number;
    rooms?: number;
    /** Where the search was launched from. */
    source?: "search_bar" | "landing_cta" | "destination_guide" | "month_page" | "homepage";
    /** Children picked in the guests popover (informational split). */
    children_count?: number;
    /** Whether the optional "Skąd" field was filled. */
    origin_provided?: boolean;
  };
  hotel_results_loaded: {
    destination: string;
    available_count: number;
    /** Wall-clock ms from mount to scan-complete, if measured. */
    scan_ms?: number;
  };
  hotel_card_click: {
    hotel_id: string;
    destination?: string;
    /** 1-based position in the visible list. */
    position?: number;
    price?: number;
    currency?: string;
  };

  // ── Detail + booking funnel ──
  hotel_detail_view: {
    hotel_id: string;
    destination?: string;
    has_price?: boolean;
  };
  booking_prebook_start: {
    hotel_id: string;
    price?: number;
    currency?: string;
  };
  /** /hotele/rezerwacja rendered with a complete offer link. The step
      between hotel_detail_view and booking_prebook_start — without it the
      checkout was a measurement black hole (70+ "Zarezerwuj" clicks, zero
      visibility into where they stalled). */
  checkout_view: {
    hotel_id: string;
    price?: number;
    currency?: string;
  };
  /** Prebook attempt failed (rate gone, provider error, rate limit…). The
      `code` is our booking-domain taxonomy — lets GA4 split technical
      failures from abandonment. */
  booking_prebook_error: {
    hotel_id: string;
    code?: string;
    http_status?: number;
  };
  /** The Stripe/LiteAPI payment widget actually painted (user saw card
      fields). checkout_view minus this = prebook friction; this minus
      booking_complete = payment-step abandonment. */
  booking_payment_shown: {
    amount?: number;
    currency?: string;
  };
  /** Checkout opened inside an in-app webview (TikTok/Instagram/Facebook)
      where 3-D Secure redirects are flaky — measures how much traffic is
      structurally at risk before any fix. */
  checkout_webview_detected: {
    app: string;
  };
  booking_complete: {
    /** GA4 ecommerce-style. Used as a key event / conversion. */
    booking_id: string;
    value?: number;
    currency?: string;
    hotel_id?: string;
  };

  // ── Commercial landing pages ──
  landing_view: {
    /** /hotele/w/[miasto] slug, e.g. "barcelona". */
    city_slug: string;
    monthly_volume?: number;
  };
  landing_cta_click: {
    city_slug: string;
    /** Which CTA on the page. */
    cta: "hero_search" | "hero_guide" | "featured_hotel" | "final_cta" | "month_picker";
    hotel_id?: string;
  };

  // ── Affiliate (Aviasales / Travelpayouts) ──
  affiliate_click: {
    /** Used as a key event / conversion. */
    provider: "aviasales" | "hotellook" | "other";
    destination?: string;
    campaign?: string;
  };

  // ── Engagement ──
  destination_save: {
    slug: string;
    city?: string;
  };
  hotel_save: {
    hotel_id: string;
    destination?: string;
  };

  // ── Lejek lotów (LiteAPI Flights) — OBOK hotelowych, nie zamiast ──
  flight_search: {
    origin: string;
    destination: string;
    /** YYYY-MM-DD */
    depart?: string;
    return?: string;
    /** SUMA pasażerów (adults+children+infants). */
    passengers?: number;
    round_trip?: boolean;
    cabin_class?: string;
  };
  flight_results_view: {
    origin: string;
    destination: string;
    results_count: number;
  };
  flight_select: {
    offer_id: string;
    price?: number;
    currency?: string;
    carrier?: string;
  };
  /** Verify zwrócił inną cenę niż w wynikach — mierzy tarcie „cena się zmieniła". */
  flight_verify_price_change: {
    offer_id: string;
    old_price?: number;
    new_price?: number;
    currency?: string;
  };
  flight_passenger_form_start: {
    offer_id?: string;
  };
  flight_prebook: {
    offer_id?: string;
    price?: number;
    currency?: string;
  };
  flight_payment_start: {
    amount?: number;
    currency?: string;
  };
  flight_payment_error: {
    code?: string;
    http_status?: number;
  };
  /** Zakup lotu — GA4 ecommerce. `item_category:"flight"` ODRÓŻNIA od hoteli. */
  purchase: {
    booking_id: string;
    value?: number;
    currency?: string;
    item_category: "flight";
  };
}

export type TrackEventName = keyof TrackEventMap;

/**
 * Fire a typed GA4 event. Safe to call anywhere — no-ops on the server and
 * when analytics consent hasn't loaded gtag. Never throws.
 */
export function track<E extends TrackEventName>(
  event: E,
  params: TrackEventMap[E],
): void {
  try {
    if (typeof window === "undefined") return;
    const gtag = (window as WindowWithGtag).gtag;
    if (typeof gtag !== "function") return; // consent denied / not loaded
    gtag("event", event, params as Record<string, unknown>);
  } catch {
    // Analytics must NEVER break the UX. Swallow everything.
  }
}
