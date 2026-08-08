"use client";

// React Context exposing consent state + setters to client components.
//
// Server components cannot read consent (it lives in localStorage). Anything
// that gates on consent — analytics, marketing pixels, the Web Vitals
// reporter — must be a client component that reads from this context.
//
// API:
//   • <ConsentProvider> — wrap the app root
//   • useConsent()      — read current decision + helpers
//   • dispatchConsentChange() — fired on every change, plus a window event
//     `helptravel:consent-change` for non-React listeners (e.g. third-party
//     SDKs loaded with <Script>).

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  ACCEPT_ALL_DECISION,
  DEFAULT_DECISION,
  REJECT_ALL_DECISION,
  type ConsentDecision,
  type ConsentRecord,
} from "./types";
import {
  clearConsent,
  consentServerSnapshot,
  consentSnapshot,
  invalidateConsentSnapshot,
  writeConsent,
} from "./storage";

export const CONSENT_CHANGE_EVENT = "helptravel:consent-change";

interface ConsentContextValue {
  /** True until the first localStorage read completes (avoids SSR flash). */
  isHydrating: boolean;
  /** True iff there is NO valid stored decision and the banner should show. */
  needsDecision: boolean;
  record: ConsentRecord | null;
  decision: ConsentDecision;
  /** Open the granular settings modal (also opens it if banner is closed). */
  isSettingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
  acceptAll: () => void;
  rejectAll: () => void;
  /** Set arbitrary granular decision (used by Settings modal). */
  setDecision: (d: Partial<ConsentDecision>) => void;
  /** Clear stored consent (used by "withdraw consent" flow). */
  withdraw: () => void;
}

const ConsentContext = createContext<ConsentContextValue | null>(null);

export function useConsent(): ConsentContextValue {
  const ctx = useContext(ConsentContext);
  if (!ctx) {
    throw new Error("useConsent() must be used inside <ConsentProvider>");
  }
  return ctx;
}

function dispatchConsentChange(decision: ConsentDecision) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(CONSENT_CHANGE_EVENT, { detail: decision }),
  );
}

/** Powiadamiacz store'u zgody — jedno miejsce, z którego React się dowiaduje. */
const sluchacze = new Set<() => void>();
function subskrybujZgode(onChange: () => void): () => void {
  sluchacze.add(onChange);
  // Zmiana w innej karcie przeglądarki też ma odświeżyć ten stan.
  const naStorage = () => onChange();
  if (typeof window !== "undefined") window.addEventListener("storage", naStorage);
  return () => {
    sluchacze.delete(onChange);
    if (typeof window !== "undefined") window.removeEventListener("storage", naStorage);
  };
}
function powiadomOZgodzie(): void {
  invalidateConsentSnapshot();
  for (const s of sluchacze) s();
}

export function ConsentProvider({ children }: { children: ReactNode }) {
  // Zgoda mieszka w localStorage, czyli POZA Reactem — i dokładnie do tego
  // służy `useSyncExternalStore`. Wcześniej stan czytał `useEffect`
  // z `setState` w środku: dodatkowy przebieg renderu na każdym wejściu na
  // stronę i błąd lintu `react-hooks/set-state-in-effect`.
  //
  // Migawka serwerowa to `null`, więc pierwszy render klienta zgadza się
  // z serwerowym i baner nie mruga u gościa, który już podjął decyzję.
  const record = useSyncExternalStore(subskrybujZgode, consentSnapshot, consentServerSnapshot);
  // `isHydrating` zostaje w API kontekstu, bo czytają je konsumenci. Znaczy
  // teraz „jesteśmy jeszcze na serwerze / przed pierwszym malowaniem".
  const isHydrating = useSyncExternalStore(
    subskrybujZgode,
    () => false,
    () => true,
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const decision = useMemo<ConsentDecision>(
    () => record?.decision ?? DEFAULT_DECISION,
    [record],
  );
  const needsDecision = !isHydrating && record === null;

  const commit = useCallback((next: ConsentDecision) => {
    writeConsent(next);
    powiadomOZgodzie();
    dispatchConsentChange(next);
  }, []);

  const acceptAll = useCallback(() => {
    commit(ACCEPT_ALL_DECISION);
    setIsSettingsOpen(false);
  }, [commit]);

  const rejectAll = useCallback(() => {
    commit(REJECT_ALL_DECISION);
    setIsSettingsOpen(false);
  }, [commit]);

  const setDecision = useCallback(
    (partial: Partial<ConsentDecision>) => {
      const merged: ConsentDecision = {
        necessary: true,
        analytics: partial.analytics ?? decision.analytics,
        marketing: partial.marketing ?? decision.marketing,
      };
      commit(merged);
    },
    [commit, decision],
  );

  const withdraw = useCallback(() => {
    clearConsent();
    powiadomOZgodzie();
    dispatchConsentChange(DEFAULT_DECISION);
  }, []);

  const value = useMemo<ConsentContextValue>(
    () => ({
      isHydrating,
      needsDecision,
      record,
      decision,
      isSettingsOpen,
      openSettings: () => setIsSettingsOpen(true),
      closeSettings: () => setIsSettingsOpen(false),
      acceptAll,
      rejectAll,
      setDecision,
      withdraw,
    }),
    [
      isHydrating,
      needsDecision,
      record,
      decision,
      isSettingsOpen,
      acceptAll,
      rejectAll,
      setDecision,
      withdraw,
    ],
  );

  return (
    <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>
  );
}

/**
 * Subscribe to consent changes from non-React code (e.g. analytics SDKs
 * that need to know when to start/stop sending events). Returns an unsubscriber.
 */
export function onConsentChange(
  callback: (decision: ConsentDecision) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<ConsentDecision>).detail;
    if (detail) callback(detail);
  };
  window.addEventListener(CONSENT_CHANGE_EVENT, handler);
  return () => window.removeEventListener(CONSENT_CHANGE_EVENT, handler);
}
