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
    /**
     * Where the search was launched from.
     *
     * `search_bar_hotel` (2026-08-02) to ta sama wyszukiwarka, ale INNA
     * intencja: użytkownik wpisał nazwę obiektu i trafił prosto na jego stronę,
     * z pominięciem listy wyników. Wrzucone pod `search_bar` byłoby nierozróżnialne
     * od szukania kierunku, więc nie dałoby się sprawdzić, czy ta ścieżka
     * w ogóle jest używana ani jak konwertuje.
     */
    source?:
      | "search_bar"
      | "search_bar_hotel"
      | "landing_cta"
      | "destination_guide"
      | "month_page"
      | "homepage";
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

  // ── Affiliate (legacy — outbound loty usunięte w Fazie 4; zostaje typ na
  //    wypadek pozostałych linków afiliacyjnych hotelowych) ──
  affiliate_click: {
    /** Used as a key event / conversion. */
    provider: "hotellook" | "other";
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
  // ── AI Concierge (czat doboru wyjazdu) ──
  concierge_open: {
    /** Ścieżka strony, na której otwarto czat. */
    page_path?: string;
    /** Którym wejściem użytkownik trafił do czatu. Redesign 2026-07 dał trzy
     *  wejścia zamiast jednego dymka — bez tego parametru nie wiadomo, które
     *  z nich faktycznie działa i czy warto utrzymywać pozostałe. */
    source?: "hero_tab" | "category_tile" | "launcher" | "proactive";
  };
  concierge_message: {
    /** Długość wiadomości użytkownika w znakach — świadomie BEZ treści (zero PII). */
    message_chars?: number;
  };
  concierge_offer_shown: {
    city?: string;
    total_per_person?: number;
    /** true = brakowało hotelu albo lotu (oferta częściowa). */
    partial?: boolean;
  };
  /** Klik w podgląd karty oferty — handoff do strony hotelu / wyników lotów. */
  concierge_offer_click: {
    target: "hotel" | "flight";
    city?: string;
  };
  /** Klik „Spróbuj ponownie" po błędzie odpowiedzi — mierzy tarcie transportu (cold start/timeout). */
  concierge_retry: {
    page_path?: string;
  };

  // ── Homepage: lejek NAD wyszukiwarką (redesign 2026-07) ──
  // Powód istnienia całej tej grupy: do tej pory z homepage leciały tylko
  // `hotel_search_submit` i `flight_search`, czyli wyłącznie moment WYSŁANIA
  // formularza. Wszystko wcześniej — co użytkownik w ogóle zobaczył, w co
  // kliknął, czy przełączył zakładkę — było niewidoczne. Przy konwersji 0,07%
  // to właśnie ten odcinek trzeba mierzyć, bo tam ludzie odpadają.

  /** Start wyszukiwania z hero. Rozróżnia intencję: konkretny kierunek vs
   *  „gdziekolwiek" i termin sztywny vs elastyczny — bez tego nie da się
   *  ocenić, czy niezdecydowani w ogóle ruszają dalej. */
  search_started: {
    tab: "hotels" | "flights" | "assistant";
    destination_type: "specific" | "anywhere";
    date_mode: "fixed" | "flexible";
  };
  /** Przełączenie zakładki hero — mierzy zainteresowanie trzecią ścieżką
   *  („Nie wiem dokąd”) względem klasycznych formularzy. */
  hero_tab_changed: {
    to: "hotels" | "flights" | "assistant";
  };
  /** Klik kafla kategorii — czy sekcja „Nie wiesz dokąd" realnie prowadzi dalej. */
  category_tile_clicked: {
    slug: string;
    position?: number;
  };
  /** Klik karty kierunku w karuzeli — mierzy też, jak głęboko ludzie przewijają. */
  destination_card_clicked: {
    slug: string;
    position?: number;
    price_per_person?: number;
  };
  /** Klik karty w pasie „Polecane hotele" (2026-08-02). `slug` to hotelId
   *  LiteAPI (`lp…`) — celowo OSOBNY event, żeby identyfikatory hoteli nie
   *  zaśmiecały raportu kierunków. Zastępuje `package_card_clicked`, który
   *  odszedł razem z sekcją pakietów (ostatnie dane sprzed 2026-08-02). */
  featured_hotel_card_clicked: {
    slug: string;
    position?: number;
    price_per_person?: number;
  };
  /** Klik karty w pasie „Okazje lotnicze" (2026-08-02). `slug` to klucz trasy
   *  (`WAW-BCN`), a nie kierunek z seeda — ta sama zasada rozdziału co przy
   *  hotelach: trasa i kierunek to dwa różne wymiary i wspólny event zlepiłby
   *  je w jedną, nierozdzielną liczbę. `saving_percent` jest tu kluczowy:
   *  pozwala sprawdzić, czy wielkość rabatu w ogóle przekłada się na kliki,
   *  czy tylko na naszą satysfakcję z algorytmu. */
  flight_deal_card_clicked: {
    slug: string;
    position?: number;
    price_per_person?: number;
    saving_percent?: number;
  };
  /** Użycie zwiniętego paska wyszukiwania w sticky navie — czy wzorzec
   *  „szukaj z dowolnego miejsca strony" jest w ogóle używany. */
  sticky_search_used: {
    page_path?: string;
  };

  // ── Sekcje ofertowe strony głównej — schemat ecommerce GA4 ──
  // Powód użycia `view_item_list`/`select_item` zamiast własnych nazw: GA4 ma
  // dla nich gotowe raporty (lista → klik → konwersja), więc lejek trzech
  // sekcji da się porównać bez budowania eksploracji od zera.
  //
  // `item_list_id` ROZRÓŻNIA sekcje — bez tego wszystkie kliki zlewają się
  // w jedną liczbę i nie da się powiedzieć, która sekcja realnie sprzedaje,
  // a którą można usunąć.

  /** Sekcja ofertowa weszła w pole widzenia. */
  view_item_list: {
    /** `home_inspire` (A) · `home_packages` (B) · `home_themes` (C, kafle). */
    item_list_id: string;
    item_list_name: string;
    /** Wariant treści nagłówka/CTA — patrz lib/home/copy.ts. */
    copy_variant?: string;
    items: Array<{
      item_id: string;
      item_name: string;
      /** Miasto — pozwala zobaczyć, które kierunki niosą listę. */
      item_category?: string;
      price?: number;
      currency?: "PLN";
      /** 1-based pozycja w liście: mierzy, jak głęboko ludzie przewijają. */
      index: number;
    }>;
  };

  /** Klik w kartę oferty. */
  select_item: {
    item_list_id: string;
    item_list_name: string;
    copy_variant?: string;
    items: Array<{
      item_id: string;
      item_name: string;
      item_category?: string;
      price?: number;
      currency?: "PLN";
      index: number;
    }>;
  };

  // ── Dobieracz wyjazdu (sekcja C) ──
  // Osobne eventy, nie ecommerce: to nie jest lista produktów, tylko formularz
  // intencji. Chcemy wiedzieć, na KTÓRYM kroku ludzie odpadają — sam
  // `quiz_submit` powiedziałby tylko, ilu doszło do końca.

  /**
   * Dobieracz wszedł w pole widzenia — MIANOWNIK dla `quiz_start`.
   *
   * Bez tego znamy tylko liczbę rozpoczętych doborów, a to za mało na
   * jakąkolwiek decyzję: niski `quiz_start` znaczy albo „widget nie zachęca",
   * albo „nikt tu nie doscrollował", a to dwa przeciwne wnioski.
   */
  quiz_view: {
    page_path?: string;
    /** Ile ofert widget mógł zaoferować w chwili pokazania — sekcja z pustą
     *  pulą nie jest tym samym co sekcja zignorowana. */
    available_count?: number;
    copy_variant?: string;
  };

  /** Pierwsza interakcja z dobieraczem w tej wizycie. */
  quiz_start: {
    page_path?: string;
  };
  quiz_step_complete: {
    /** 1 = budżet, 2 = typ wyjazdu. */
    step: number;
    step_name: "budget" | "theme";
    /** Wybrana wartość — pokazuje, których budżetów i typów naprawdę szukają. */
    value: string;
  };
  quiz_submit: {
    budget: string;
    theme: string;
    /** Ile ofert pasowało w momencie kliknięcia — łączy intencję z podażą. */
    results_count: number;
    cheapest_price?: number;
    copy_variant?: string;
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
