// FAZA 3 — ukrycie boilerplate'u COVID/higiena.
//
// Sekcja udogodnień bywa zapchana frazami z czasów pandemii („Maseczki dla
// gości", „Dezynfekcja między pobytami", „Physical distancing rules followed",
// „Hand sanitizer…") — wygląda jak skopiowane 4 lata temu i postarza serwis.
// Domyślnie chowamy te pozycje (flaga `HIDE_COVID_FACILITIES`, łatwo cofnąć).
//
// WAŻNE: celowo NIE łapiemy realnych udogodnień bezpieczeństwa (monitoring/CCTV,
// czujniki dymu, gaśnice, ochrona, apteczka, dostęp na kartę) ani nowoczesnego
// „bezdotykowego zameldowania" — te zostają. Po odfiltrowaniu grupa
// „Bezpieczeństwo i higiena" może zostać pusta → `groupFacilities` i tak nie
// renderuje pustych grup (nagłówek znika sam).

import { hideCovidFacilities } from "@/lib/config/featureFlags";

// Substringi (lowercase, PL+EN). Trafienie = boilerplate COVID/higiena → chowamy.
const COVID_BLACKLIST = [
  "covid",
  "distancing", "dystans", // physical distancing / zachowany dystans / dystansowanie
  "sanitiz", "sanitis", // hand sanitizer / sanitized tableware
  "disinfect", "dezynfek", // disinfected between stays / dezynfekcja
  "between stays", "między pobytami",
  "face mask", "maseczk",
  "personal protective", "środki ochrony osob",
  "safety protocol", "protokoł", // staff follow safety protocols / lokalnych protokołów
  "barriers between", "screens / barriers", "ekrany / barier", "bariery między",
  "sealed after", "guest room sealed", // guest room sealed after cleaning
  "cleaned by professional", "professional cleaning compan",
  "health of guests", "check the health", "check health",
  "temperature screening", "temperature check",
  "shared stationery", // shared stationery like menus, pens are removed
  "opt-out", "opt out", // guests can opt-out cleaning services
  "hand sanitizer",
  // FAZA 6 (QA) — luki znalezione na żywych hotelach (Ateny/Rzym):
  "coronavirus", "koronawirus", // „…effective against Coronavirus"
  "thermometer", "termometr", // „Thermometers for guests provided by property"
  "securely covered", "bezpiecznie przykryt", // „Delivered food - securely covered"
];

/** Czy facility to boilerplate COVID/higiena (do ukrycia). */
export function isCovidBoilerplate(s: string): boolean {
  const t = s.toLowerCase();
  return COVID_BLACKLIST.some((k) => t.includes(k));
}

/**
 * Odfiltruj boilerplate COVID z listy facility. Domyślnie sterowane flagą
 * `HIDE_COVID_FACILITIES` (env); `enabled=false` zwraca listę bez zmian.
 */
export function stripCovidFacilities(
  list: readonly string[],
  enabled: boolean = hideCovidFacilities(),
): string[] {
  if (!enabled) return [...list];
  return list.filter((s) => !isCovidBoilerplate(s));
}
