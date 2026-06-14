"use client";

// PaymentSlot — single source of truth for the LiteAPI Payment widget.
//
// Owns:
//   • B5 race fix — bounded rAF DOM-wait (max 10 frames) before calling
//     `new LiteAPIPayment(...).handlePayment()`. Copied verbatim from the
//     pre-extraction code to avoid regressing the Stripe IntegrationError
//     that bit us on the cached-script path.
//   • B6 env binding — widget `publicKey` is `prebook.widgetEnv` (the same
//     prebook response as `secretKey`), so the Stripe publishable key and
//     client secret cannot be from different Stripe modes.
//   • Skeleton-tiles fix — the skeleton is a SIBLING of `#payment-element`
//     (not a child), so the widget doesn't paint over it. A MutationObserver
//     hides the skeleton the moment the widget injects its DOM. A 3000 ms
//     timeout is a defensive fallback if the observer misses the injection.
//   • Clean unmount — cancel any rAF, observer, timeout, and in-flight init.
//
// Parent supplies the prebook payload + base URL; calls `onMountFail` to
// restore the form view + show the existing user-facing error.

import { useEffect, useRef, useState } from "react";

import { track } from "@/lib/analytics/track";

const WIDGET_SRC =
  "https://payment-wrapper.liteapi.travel/dist/liteAPIPayment.js?v=a1";
const SKELETON_FALLBACK_MS = 3000;

interface LiteApiPaymentCtor {
  new (config: Record<string, unknown>): { handlePayment: () => Promise<void> };
}
declare global {
  interface Window {
    LiteAPIPayment?: LiteApiPaymentCtor;
  }
}

export interface PaymentSlotPrebook {
  secretKey: string;
  sessionId: string;
  amount: number;
  currency: string;
  widgetEnv: "live" | "sandbox";
}

interface Props {
  prebook: PaymentSlotPrebook;
  returnBaseUrl: string;
  /** Pay-button label inside the widget — pass the exact amount ("Zapłać
      2060 zł") so the buyer sees precisely what leaves the card. */
  submitText?: string;
  /** Ścieżka powrotu po płatności względem returnBaseUrl. Domyślnie hotelowa
   *  (/hotele/rezerwacja/return). Loty przekazują /loty/platnosc/return
   *  (zmiana addytywna — flow hotelowy bez zmian). `sid` doklejamy sami. */
  returnPath?: string;
  onMountFail: () => void;
}

function loadWidgetScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.LiteAPIPayment) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${WIDGET_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("widget script failed")),
      );
      return;
    }
    const s = document.createElement("script");
    s.src = WIDGET_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("widget script failed"));
    document.head.appendChild(s);
  });
}

export function PaymentSlot({ prebook, returnBaseUrl, submitText, returnPath = "/hotele/rezerwacja/return", onMountFail }: Props) {
  const [widgetMounted, setWidgetMounted] = useState(false);

  // Ref pattern: parents may pass an inline arrow as onMountFail; reading the
  // latest via ref means we don't have to depend on it (re-init would race).
  const onMountFailRef = useRef(onMountFail);
  useEffect(() => {
    onMountFailRef.current = onMountFail;
  }, [onMountFail]);

  useEffect(() => {
    let cancelled = false;
    let rafHandle = 0;
    let observer: MutationObserver | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    const teardownMountWatchers = () => {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
    };

    const markMounted = () => {
      if (cancelled) return;
      teardownMountWatchers();
      setWidgetMounted(true);
      // Funnel beacon: the user actually SAW payment fields. The gap between
      // checkout_view → this event is prebook/widget friction; between this
      // and booking_complete is payment-step abandonment.
      track("booking_payment_shown", {
        amount: prebook.amount,
        currency: prebook.currency,
      });
    };

    async function initWidget() {
      try {
        await loadWidgetScript();
      } catch {
        if (!cancelled) onMountFailRef.current();
        return;
      }
      if (cancelled) return;

      // B5: wait for the #payment-element node to be committed by React.
      let retries = 0;
      const MAX_RETRIES = 10;
      while (
        !document.getElementById("payment-element") &&
        retries < MAX_RETRIES
      ) {
        retries++;
        await new Promise<void>((r) => {
          rafHandle = requestAnimationFrame(() => r());
        });
        if (cancelled) return;
      }

      const target = document.getElementById("payment-element");
      if (!target) {
        console.error(
          "[booking][widget] #payment-element never mounted after",
          retries,
          "retries — aborting widget init",
        );
        if (!cancelled) onMountFailRef.current();
        return;
      }
      if (!window.LiteAPIPayment) {
        console.error(
          "[booking][widget] LiteAPIPayment global unavailable after script load",
        );
        if (!cancelled) onMountFailRef.current();
        return;
      }

      // Skeleton fix — watch the target for any injected element. The widget
      // appends its iframe (or similar) here; the first non-empty mutation is
      // our signal to hide the sibling skeleton.
      observer = new MutationObserver(() => {
        if (target.childElementCount > 0) markMounted();
      });
      observer.observe(target, { childList: true });
      fallbackTimer = setTimeout(markMounted, SKELETON_FALLBACK_MS);

      const returnUrl = `${returnBaseUrl}${returnPath}?sid=${encodeURIComponent(
        prebook.sessionId,
      )}`;
      new window.LiteAPIPayment({
        publicKey: prebook.widgetEnv,
        secretKey: prebook.secretKey,
        returnUrl,
        targetElement: "#payment-element",
        appearance: { theme: "flat" },
        // Business name shown in the LiteAPI/Stripe Payment Element header.
        // NOTE: this only relabels the checkout FORM. The card-authorisation
        // screen in the user's bank/wallet (e.g. Revolut "NUITEE TRAVEL") shows
        // the MERCHANT OF RECORD — Nuitee Travel (LiteAPI's payment entity) —
        // which is set in their Stripe account, NOT here, and cannot be changed
        // from the SDK. We reassure the user about this on the page itself.
        options: { business: { name: "Help Travel" } },
        amount: prebook.amount,
        currency: prebook.currency,
        submitButton: { text: submitText ?? "Zapłać teraz" },
      }).handlePayment();
    }

    void initWidget();

    return () => {
      cancelled = true;
      if (rafHandle) cancelAnimationFrame(rafHandle);
      teardownMountWatchers();
    };
  }, [prebook, returnBaseUrl, submitText, returnPath]);

  return (
    <div className="relative min-h-[280px]">
      {!widgetMounted && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 animate-pulse space-y-3 motion-reduce:animate-none"
        >
          <div className="h-10 rounded bg-neutral-100" />
          <div className="h-10 rounded bg-neutral-100" />
          <div className="h-10 w-1/2 rounded bg-neutral-100" />
        </div>
      )}
      <div id="payment-element" className="relative z-10" />
    </div>
  );
}
