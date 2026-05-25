// Cookie / tracking consent — types and constants.
//
// Categories follow EU practice (TCF v2-aligned but not certified):
//   • necessary  — strictly required for the site to function. Always on,
//                  cannot be rejected (session id, CSRF, language preference,
//                  the consent record itself). No banner gate.
//   • analytics  — aggregate usage metrics (Plausible/GA4). Anonymous-ish.
//   • marketing  — affiliate-click attribution and retargeting pixels.
//                  Currently includes Travelpayouts marker, CJ click ids.
//
// Storage scheme: a single JSON blob in localStorage. We version it so future
// category additions can force a re-prompt of users whose record predates the
// new category. Stored timestamp lets us expire after 12 months (ePrivacy
// recommendation — "consent is not a one-time act").

export const CONSENT_STORAGE_KEY = "helptravel-cookie-consent-v1";
export const CONSENT_VERSION = 1;
// 12 months — per ICO/UODO guidance ("regular intervals", with 6-13 months
// being industry consensus). After expiry the banner re-appears.
export const CONSENT_TTL_MS = 365 * 24 * 60 * 60 * 1000;

export type ConsentCategory = "necessary" | "analytics" | "marketing";

export interface ConsentDecision {
  /** Strictly-required cookies. Always true; cannot be rejected. */
  necessary: true;
  /** Analytics (Plausible/GA). */
  analytics: boolean;
  /** Marketing pixels and affiliate-attribution cookies. */
  marketing: boolean;
}

export interface ConsentRecord {
  version: number;
  /** Unix ms when the user made the decision. */
  decidedAt: number;
  decision: ConsentDecision;
}

/** Sane default before the user has decided — strictest possible. */
export const DEFAULT_DECISION: ConsentDecision = {
  necessary: true,
  analytics: false,
  marketing: false,
};

/** When the user clicks "Accept all". */
export const ACCEPT_ALL_DECISION: ConsentDecision = {
  necessary: true,
  analytics: true,
  marketing: true,
};

/** When the user clicks "Reject all" (= necessary only). */
export const REJECT_ALL_DECISION: ConsentDecision = {
  ...DEFAULT_DECISION,
};

/**
 * Pages where the banner is suppressed. Showing the banner over a legal page
 * is both visually bad and arguably coercive (user is already reading about
 * their rights — let them read it).
 */
export const BANNER_SUPPRESSED_PATHS: ReadonlyArray<string> = [
  "/polityka-prywatnosci",
  "/regulamin",
];
