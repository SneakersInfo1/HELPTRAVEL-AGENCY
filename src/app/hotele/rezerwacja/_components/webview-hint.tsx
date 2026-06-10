"use client";

// In-app-webview escape hatch for the checkout.
//
// Most of our paid-intent traffic arrives from TikTok/Instagram/Facebook,
// whose in-app browsers routinely break the 3-D Secure bank-app redirect that
// every Polish card payment requires (the redirect opens the bank app, but the
// webview can't resume the Stripe session on return). Result: the user passes
// the form, sees the card fields, pays in the bank app… and the booking never
// completes — invisible to us, infuriating for them.
//
// This banner shows ONLY when the UA identifies a known in-app webview. It
// nudges the user to open the page in a real browser and offers a one-tap
// "copy link" (webviews hide the address bar, so copy-paste is the only
// reliable hand-off). Dismissible per session. Fires a GA4 event so we can
// quantify how much checkout traffic is structurally at risk.

import { useEffect, useState } from "react";

import { track } from "@/lib/analytics/track";

function detectInAppBrowser(ua: string): string | null {
  if (/TikTok|musical_ly|Bytedance/i.test(ua)) return "tiktok";
  if (/Instagram/i.test(ua)) return "instagram";
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return "facebook";
  if (/Messenger/i.test(ua)) return "messenger";
  return null;
}

const DISMISS_KEY = "ht_webview_hint_dismissed";

export function WebviewHint() {
  const [app, setApp] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_KEY)) return;
    } catch {
      /* storage blocked — still show the hint */
    }
    const detected = detectInAppBrowser(navigator.userAgent);
    if (!detected) return;
    // Deferred (not synchronous in the effect body) so the mount render
    // settles first — react-hooks/set-state-in-effect compliant.
    const timer = setTimeout(() => {
      setApp(detected);
      track("checkout_webview_detected", { app: detected });
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  if (!app) return null;

  const dismiss = () => {
    setApp(null);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* non-fatal */
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* clipboard blocked — the user can still use the share/open-in-browser
         menu of the app; nothing else we can do from a webview */
    }
  };

  return (
    <div
      role="status"
      className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm leading-5 text-amber-900">
          <strong>Przeglądasz w aplikacji.</strong> Potwierdzenie płatności w
          aplikacji banku (3D&nbsp;Secure) może się tu nie udać. Dla pewnej
          rezerwacji otwórz tę stronę w Chrome lub Safari.
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Zamknij podpowiedź"
          className="shrink-0 rounded-md px-2 py-0.5 text-sm font-medium text-amber-800 hover:bg-amber-100"
        >
          ✕
        </button>
      </div>
      <button
        type="button"
        onClick={copyLink}
        className="mt-2 inline-flex h-9 items-center justify-center rounded-lg border border-amber-400 bg-white px-4 text-xs font-semibold text-amber-900 hover:bg-amber-100"
      >
        {copied ? "Skopiowano — wklej w przeglądarce" : "Kopiuj link do tej strony"}
      </button>
    </div>
  );
}
