// Consent record persistence. Pure helpers — no React, no DOM-element assumptions
// beyond `localStorage`. SSR-safe (every entry point checks `typeof window`).
//
// Storage is intentionally NOT a cookie. RODO/ePrivacy is about
// non-essential trackers; the consent record itself is "necessary" (we need
// it to remember what the user said) and putting it in localStorage rather
// than a cookie means it doesn't get shipped with every HTTP request and
// can't be read cross-site.

import {
  CONSENT_STORAGE_KEY,
  CONSENT_TTL_MS,
  CONSENT_VERSION,
  DEFAULT_DECISION,
  type ConsentDecision,
  type ConsentRecord,
} from "./types";

function safeLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    // Touch storage to detect Safari private-mode quota errors. Cheap.
    window.localStorage.setItem("__consent_probe__", "1");
    window.localStorage.removeItem("__consent_probe__");
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readConsent(): ConsentRecord | null {
  const ls = safeLocalStorage();
  if (!ls) return null;

  const raw = ls.getItem(CONSENT_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const rec = parsed as Partial<ConsentRecord>;
    if (typeof rec.version !== "number" || rec.version !== CONSENT_VERSION) {
      // Stored version mismatch (we added/removed a category). Treat as
      // missing — banner will re-appear and the user re-consents under the
      // current category set.
      return null;
    }
    if (typeof rec.decidedAt !== "number") return null;
    if (Date.now() - rec.decidedAt > CONSENT_TTL_MS) {
      // Expired per ePrivacy "regular intervals" guidance.
      return null;
    }
    const d = rec.decision;
    if (!d || typeof d !== "object") return null;
    return {
      version: rec.version,
      decidedAt: rec.decidedAt,
      decision: {
        necessary: true,
        analytics: Boolean((d as ConsentDecision).analytics),
        marketing: Boolean((d as ConsentDecision).marketing),
      },
    };
  } catch {
    return null;
  }
}

export function writeConsent(decision: ConsentDecision): ConsentRecord | null {
  const ls = safeLocalStorage();
  if (!ls) return null;
  const record: ConsentRecord = {
    version: CONSENT_VERSION,
    decidedAt: Date.now(),
    decision: { ...decision, necessary: true },
  };
  try {
    ls.setItem(CONSENT_STORAGE_KEY, JSON.stringify(record));
    return record;
  } catch {
    return null;
  }
}

export function clearConsent(): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    ls.removeItem(CONSENT_STORAGE_KEY);
  } catch {
    // Ignore quota / privacy-mode errors.
  }
}

// ── Zapamiętany odczyt dla `useSyncExternalStore` ────────────────────────────
//
// `readConsent()` parsuje JSON i zwraca ZA KAŻDYM RAZEM nowy obiekt, więc nie
// nadaje się na `getSnapshot`: React porównuje migawki tożsamością i wpadłby
// w nieskończoną pętlę renderów. Trzymamy więc jedną migawkę i podmieniamy ją
// tylko wtedy, gdy zmieni się TREŚĆ zapisu.
//
// Po co w ogóle: `ConsentProvider` czytał localStorage w `useEffect` i wołał
// tam `setState`, co jest w tym repo błędem lintu (`react-hooks/
// set-state-in-effect`) i realnie powoduje dodatkowy przebieg renderu na
// każdym wejściu na stronę. `useSyncExternalStore` jest dokładnie tym
// narzędziem: stan żyje poza Reactem (w localStorage), a serwer dostaje własną
// migawkę, więc hydracja się zgadza i baner nie mruga.

let migawka: ConsentRecord | null = null;
let migawkaSurowa: string | null = null;
/**
 * Czy `migawkaSurowa` w ogóle coś znaczy.
 *
 * Osobna flaga, a NIE wartownik w postaci nietypowego napisu: `null` jest
 * poprawną wartością odczytu (brak zapisu w localStorage), więc bez tej flagi
 * pierwszy odczyt (brak zgody) byłby nieodróżnialny od stanu początkowego
 * i `readConsent()` nie wykonałoby się ani razu.
 */
let migawkaWazna = false;

/** Migawka zapisu zgody — stabilna tożsamość, dopóki treść się nie zmieni. */
export function consentSnapshot(): ConsentRecord | null {
  const ls = safeLocalStorage();
  const raw = ls ? ls.getItem(CONSENT_STORAGE_KEY) : null;
  if (!migawkaWazna || raw !== migawkaSurowa) {
    migawkaSurowa = raw;
    migawkaWazna = true;
    migawka = readConsent();
  }
  return migawka;
}

/** Migawka serwerowa — na serwerze nie ma localStorage, więc „brak decyzji". */
export function consentServerSnapshot(): ConsentRecord | null {
  return null;
}

/** Unieważnia zapamiętaną migawkę po naszym własnym zapisie. */
export function invalidateConsentSnapshot(): void {
  migawkaWazna = false;
}

/** Effective decision when no record exists — strictest possible. */
export function effectiveDecision(record: ConsentRecord | null): ConsentDecision {
  return record?.decision ?? DEFAULT_DECISION;
}
