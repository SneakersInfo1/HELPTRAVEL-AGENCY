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
//
// ─── Co naprawił PR #2A (audyt integralności analityki, 2026-09-18) ───────
//
// 1. ŚCIEŻKA STRONY. `page_path` i `page_location` idą przez
//    `analyticsPagePath()`, czyli jedno źródło prawdy (lib/analytics/page-path.ts).
//    Wcześniej `page_path` był sklejany ręcznie (`pathname + "?" + query`),
//    a `page_location` szedł SUROWYM `window.location.href`. To drugie było
//    ważniejsze, niż wygląda: wymiar „Page path and query string" w GA4 jest
//    wyprowadzany z `page_location`, więc poprawianie samego `page_path` nie
//    zmieniłoby ANI JEDNEGO wiersza raportu.
//
// 2. POŚWIADCZENIA. Surowy `href` na stronie powrotu z płatności niósł do
//    Google `payment_intent_client_secret` (sekret Stripe’a) oraz `sid`
//    (klucz sesji rezerwacji w Redisie). Teraz `page_location` jest SKŁADANY
//    z `origin` + ścieżka kanoniczna, a nie przepisywany z adresu, więc do
//    GA4 nie ma jak trafić nic poza tym, co świadomie przepuścimy.
//    `gtag("set")` domyka to od drugiej strony: bez tego gtag dokleiłby
//    surowy `document.location` (parametr `dl`) do KAŻDEGO zdarzenia sam,
//    z pominięciem naszego `page_view`.
//
// 3. ZGUBIONA ODSŁONA WEJŚCIA. `gtag` był definiowany przez osobny
//    `<Script id="ga-init">`, a efekt wysyłający `page_view` sprawdzał
//    `typeof window.gtag !== "function"` i po cichu rezygnował. Kolejność
//    była wyścigiem: kto pierwszy — efekt Reacta czy skrypt Next/Script.
//    Gdy wygrywał efekt, PIERWSZA odsłona po udzieleniu zgody przepadała,
//    czyli gubiła się dokładnie ta, która wyznacza stronę wejścia.
//    Teraz zaślepka `gtag` (ta sama, którą zaleca Google: `dataLayer.push`)
//    powstaje w efekcie tego komponentu, więc `window.gtag` istnieje od
//    momentu montażu i KOLEJKUJE polecenia. Zewnętrzny gtag.js tylko
//    opróżnia kolejkę, kiedy się doładuje. Zniknął przy tym skrypt inline —
//    jeden nawias mniej w polityce CSP.

import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";

import {
  analyticsPagePath,
  currentAnalyticsPagePath,
  getLandingPath,
  rememberLandingPath,
} from "@/lib/analytics/page-path";
import { useConsent } from "@/lib/consent/context";

declare global {
  interface Window {
    dataLayer?: unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gtag?: (...args: any[]) => void;
  }
}

/**
 * Zaślepka `gtag` kolejkująca polecenia do `dataLayer`.
 *
 * Idempotentna: druga próba nic nie robi, więc przemontowanie komponentu nie
 * resetuje kolejki ani nie duplikuje konfiguracji.
 */
function zapewnijGtag(): void {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag === "function") return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  window.gtag = function gtag(...args: any[]) {
    window.dataLayer?.push(args);
  };
}

function PageViewTracker({ measurementId }: { measurementId: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.gtag !== "function") return;

    // ŹRÓDŁEM JEST `window.location`, a hooki Nexta tylko WYZWALAJĄ efekt.
    //
    // Kusiło, żeby wziąć wprost `searchParams.toString()` — wartość zgodną
    // z tym renderem, bez pytania „czy historia już się zaktualizowała".
    // Pomiar pokazał, dlaczego to gorszy wybór. Dla realnego adresu
    // `/?tab=loty?tab=loty` `URLSearchParams` czyta JEDEN parametr o wartości
    // `loty?tab=loty` i zwraca go już zakodowanego: `tab=loty%3Ftab%3Dloty`.
    // Nadmiarowy `?` nie jest wtedy widoczny jako separator, więc normalizator
    // nie ma czego skleić i adres ZOSTAJE osobnym wierszem raportu — czyli
    // dokładnie tym, co mieliśmy naprawić.
    //
    // Surowy `location.search` niesie ten `?` dosłownie, więc normalizator
    // scala zdublowaną parę i obie wersje adresu lądują w JEDNYM wierszu.
    // Kolejność jest bezpieczna: Next aktualizuje historię w efekcie
    // wstawiania (HistoryUpdater), a ten biegnie przed efektami pasywnymi.
    // To także jedno źródło wspólne z `track()`, który czyta tak samo.
    const path = currentAnalyticsPagePath() || analyticsPagePath(pathname, searchParams?.toString());
    const location = `${window.location.origin}${path}`;

    // Wartości globalne — nadpisują AUTOMATYCZNY `dl` gtag-a, czyli ten
    // parametr, którym Google dokleja surowy adres do każdego zdarzenia.
    window.gtag("set", { page_path: path, page_location: location });

    const landing = getLandingPath();
    window.gtag("event", "page_view", {
      page_path: path,
      page_location: location,
      page_title: document.title,
      ...(landing ? { landing_path: landing } : {}),
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
  const skonfigurowanoRef = useRef(false);

  const analyticsAllowed = Boolean(measurementId) && decision.analytics;

  // STRONA WEJŚCIA — zapamiętana PRZED zgodą, w pamięci ulotnej.
  //
  // Ten efekt odpala się niezależnie od decyzji o zgodzie, bo komponent jest
  // montowany zawsze (wcześniejsze wyjście przez `return null` jest PO
  // hookach). Nic nie zapisuje na urządzeniu i nic nie wysyła — to zwykła
  // zmienna modułowa, więc nie jest „przechowywaniem informacji w urządzeniu
  // końcowym" i nie wymaga zgody. Ratuje przypadek, który w audycie wyszedł
  // jako realny: zgoda udzielona z opóźnieniem, po przejściu na drugą stronę,
  // przez co GA4 brał za stronę wejścia tę drugą.
  useEffect(() => {
    rememberLandingPath(currentAnalyticsPagePath());
  }, []);

  // Zapis do refa przeniesiony z ciała renderu do efektu.
  //
  // Przy renderze współbieżnym React może przerwać i ODRZUCIĆ render — a zapis
  // do refa już się wykonał. Ref pamiętałby wtedy przebieg, który nigdy nie
  // trafił na ekran, czyli „gtag był włączony", choć nigdy się nie załadował.
  // Efekt odpala się dopiero po zatwierdzonym renderze i ustawia flagę PRZED
  // efektem sprzątającym niżej (kolejność efektów w pliku = kolejność
  // wykonania), więc zachowanie się nie zmienia.
  useEffect(() => {
    if (analyticsAllowed) wasEverEnabledRef.current = true;
  }, [analyticsAllowed]);

  // Inicjalizacja gtag-a — zaślepka + Consent Mode v2 + config.
  //
  // Wykonywana dokładnie raz, w momencie, w którym zgoda na analitykę jest
  // udzielona. Wcześniej to samo robił skrypt inline; przeniesienie do efektu
  // usuwa wyścig z `Next/Script` (patrz punkt 3 w nagłówku pliku).
  useEffect(() => {
    if (!analyticsAllowed || !measurementId) return;
    if (skonfigurowanoRef.current) return;
    skonfigurowanoRef.current = true;

    zapewnijGtag();
    const gtag = window.gtag;
    if (typeof gtag !== "function") return;

    gtag("js", new Date());
    gtag("consent", "default", {
      analytics_storage: "granted",
      ad_storage: decision.marketing ? "granted" : "denied",
      ad_user_data: decision.marketing ? "granted" : "denied",
      ad_personalization: decision.marketing ? "granted" : "denied",
      wait_for_update: 500,
    });
    gtag("config", measurementId, {
      anonymize_ip: true,
      send_page_view: false,
    });
    // `decision.marketing` świadomie POZA zależnościami: ten efekt konfiguruje
    // raz, a późniejsze zmiany zgody obsługuje efekt `consent update` niżej.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyticsAllowed, measurementId]);

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
      {/* Loader — afterInteractive so it doesn't block paint. Konfigurację
          wykonał już efekt wyżej, więc gtag.js tylko opróżnia kolejkę
          `dataLayer` i od tej chwili wysyła zdarzenia na bieżąco. */}
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
      {/* Page-view tracker. Wrapped in <Suspense> because useSearchParams()
          requires it in App Router. */}
      <Suspense fallback={null}>
        <PageViewTracker measurementId={measurementId} />
      </Suspense>
    </>
  );
}
