"use client";

// Cookie consent banner + granular settings modal.
//
// Behavior:
//   • Mounts globally (from root layout) but only renders DOM when:
//       - User has no stored decision (banner)
//       - User clicked the settings link (modal)
//   • Banner appears at the bottom of the viewport. Three primary actions:
//       Accept all / Reject all / Settings.
//   • Settings modal lets the user toggle Analytics and Marketing
//     independently. Necessary is locked on (with a tooltip explanation).
//   • Suppressed on /polityka-prywatnosci and /regulamin — user is reading
//     legal pages, no need to interrupt.
//   • Reopen flow: any link to `#cookie-settings` opens the modal (handled
//     via a global hashchange listener), so the footer link in site-shell
//     can be a plain anchor without prop drilling.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ChangeEvent } from "react";

import { useConsent } from "@/lib/consent/context";
import { BANNER_SUPPRESSED_PATHS } from "@/lib/consent/types";

const CATEGORY_COPY = {
  necessary: {
    title: "Niezbędne",
    body:
      "Wymagane do działania serwisu: identyfikator sesji, preferencja języka, sam zapis Twojej decyzji o cookies. Nie można wyłączyć.",
  },
  analytics: {
    title: "Analityczne",
    body:
      "Anonimowe statystyki użycia (ruch, czas na stronie, najczęściej odwiedzane sekcje). Pomagają ulepszać serwis. Nie identyfikujemy użytkownika.",
  },
  marketing: {
    title: "Marketingowe i afiliacyjne",
    body:
      "Identyfikatory umożliwiające przypisanie kliknięcia do partnera afiliacyjnego oraz pomiar skuteczności kampanii. Nie sprzedajemy Twoich danych.",
  },
} as const;

export function CookieConsentBanner() {
  const pathname = usePathname() ?? "/";
  const {
    isHydrating,
    needsDecision,
    decision,
    acceptAll,
    rejectAll,
    setDecision,
    isSettingsOpen,
    openSettings,
    closeSettings,
  } = useConsent();

  // Local mirror of toggles inside Settings — committed when user hits "Zapisz".
  const [draftAnalytics, setDraftAnalytics] = useState(decision.analytics);
  const [draftMarketing, setDraftMarketing] = useState(decision.marketing);

  // Sync drafts when modal (re)opens.
  useEffect(() => {
    if (isSettingsOpen) {
      setDraftAnalytics(decision.analytics);
      setDraftMarketing(decision.marketing);
    }
  }, [isSettingsOpen, decision.analytics, decision.marketing]);

  // Allow #cookie-settings hash to open the modal — used by footer links.
  useEffect(() => {
    function checkHash() {
      if (typeof window === "undefined") return;
      if (window.location.hash === "#cookie-settings") {
        openSettings();
        // Strip the hash so refreshing doesn't auto-reopen.
        const cleaned = window.location.pathname + window.location.search;
        window.history.replaceState({}, "", cleaned);
      }
    }
    checkHash();
    window.addEventListener("hashchange", checkHash);
    return () => window.removeEventListener("hashchange", checkHash);
  }, [openSettings]);

  // ESC closes settings modal.
  useEffect(() => {
    if (!isSettingsOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeSettings();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isSettingsOpen, closeSettings]);

  // Suppress banner on legal pages.
  const isSuppressed = BANNER_SUPPRESSED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (isHydrating) return null;

  return (
    <>
      {needsDecision && !isSuppressed ? (
        <div
          role="dialog"
          aria-modal="false"
          aria-labelledby="cookie-consent-title"
          aria-describedby="cookie-consent-body"
          className="fixed inset-x-2 bottom-2 z-40 mx-auto max-w-3xl rounded-[1.5rem] border border-emerald-900/15 bg-white/98 p-5 shadow-[0_20px_60px_rgba(12,58,34,0.18)] backdrop-blur-xl sm:bottom-4 sm:p-6"
        >
          <p
            id="cookie-consent-title"
            className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700"
          >
            Pliki cookie i prywatność
          </p>
          <h2 className="mt-2 text-lg font-bold text-emerald-950 sm:text-xl">
            Używamy plików cookie, aby HelpTravel działał poprawnie.
          </h2>
          <p
            id="cookie-consent-body"
            className="mt-2 text-sm leading-7 text-emerald-900/82"
          >
            Niezbędne pliki cookie są zawsze włączone. Możesz dodatkowo zgodzić się
            na cookie analityczne (pomagają nam ulepszać serwis) oraz marketingowe i
            afiliacyjne (mierzą skuteczność współpracy z partnerami). Szczegóły
            znajdziesz w{" "}
            <Link
              href="/polityka-prywatnosci"
              className="font-semibold text-emerald-700 underline-offset-2 hover:underline"
            >
              Polityce prywatności
            </Link>
            . Możesz zmienić swój wybór w dowolnej chwili.
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              onClick={acceptAll}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-emerald-700 px-5 text-sm font-bold text-white transition hover:bg-emerald-800"
            >
              Akceptuję wszystkie
            </button>
            <button
              type="button"
              onClick={rejectAll}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-emerald-900/15 bg-white px-5 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-50"
            >
              Tylko niezbędne
            </button>
            <button
              type="button"
              onClick={openSettings}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-emerald-900/10 bg-emerald-50/80 px-5 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-100"
            >
              Ustawienia
            </button>
          </div>
        </div>
      ) : null}

      {isSettingsOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cookie-settings-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-emerald-950/40 p-2 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeSettings();
          }}
        >
          <div className="w-full max-w-2xl overflow-hidden rounded-[1.5rem] border border-emerald-900/10 bg-white shadow-[0_30px_80px_rgba(12,58,34,0.3)]">
            <div className="border-b border-emerald-900/10 px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">
                    Ustawienia
                  </p>
                  <h2
                    id="cookie-settings-title"
                    className="mt-1 text-2xl font-bold text-emerald-950"
                  >
                    Twoja zgoda na cookies
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={closeSettings}
                  aria-label="Zamknij ustawienia cookies"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-emerald-900/10 bg-emerald-50 text-lg font-semibold text-emerald-900 transition hover:bg-emerald-100"
                >
                  ×
                </button>
              </div>
              <p className="mt-3 text-sm leading-7 text-emerald-900/82">
                Wybierz kategorie cookies, na które wyrażasz zgodę. Niezbędne są
                zawsze aktywne, ponieważ bez nich serwis nie zadziała poprawnie.
                Twoja decyzja jest zapisywana lokalnie na 12 miesięcy.
              </p>
            </div>

            <div className="max-h-[60vh] space-y-3 overflow-y-auto px-6 py-5">
              <CategoryCard
                title={CATEGORY_COPY.necessary.title}
                body={CATEGORY_COPY.necessary.body}
                checked
                disabled
                onChange={() => {}}
              />
              <CategoryCard
                title={CATEGORY_COPY.analytics.title}
                body={CATEGORY_COPY.analytics.body}
                checked={draftAnalytics}
                onChange={(e) => setDraftAnalytics(e.target.checked)}
              />
              <CategoryCard
                title={CATEGORY_COPY.marketing.title}
                body={CATEGORY_COPY.marketing.body}
                checked={draftMarketing}
                onChange={(e) => setDraftMarketing(e.target.checked)}
              />
            </div>

            <div className="flex flex-col gap-2 border-t border-emerald-900/10 bg-emerald-50/40 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={rejectAll}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-emerald-900/10 bg-white px-5 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-50"
              >
                Odrzuć wszystkie opcjonalne
              </button>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => {
                    setDecision({
                      analytics: draftAnalytics,
                      marketing: draftMarketing,
                    });
                    closeSettings();
                  }}
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-emerald-700 bg-white px-5 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50"
                >
                  Zapisz wybór
                </button>
                <button
                  type="button"
                  onClick={acceptAll}
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-emerald-700 px-5 text-sm font-bold text-white transition hover:bg-emerald-800"
                >
                  Akceptuję wszystkie
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

interface CategoryCardProps {
  title: string;
  body: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
}

function CategoryCard({ title, body, checked, disabled, onChange }: CategoryCardProps) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${
        disabled
          ? "cursor-not-allowed border-emerald-900/10 bg-emerald-50/60"
          : checked
            ? "border-emerald-600/60 bg-emerald-50/80"
            : "border-emerald-900/10 bg-white hover:border-emerald-500/40"
      }`}
    >
      <input
        type="checkbox"
        className="mt-1 h-5 w-5 shrink-0 rounded border-emerald-900/30 accent-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-emerald-950">{title}</span>
          {disabled ? (
            <span className="rounded-full bg-emerald-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              Wymagane
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm leading-6 text-emerald-900/78">{body}</p>
      </div>
    </label>
  );
}
