// Pamięć odmów w karcie przeglądarki: które oferty dostawca odrzucił temu gościowi.
//
// Serwer filtruje listę pokoi po odciskach z parametru `refused`. Link „Zobacz
// pokoje i ceny” niesie go wprost, ale przycisk Wstecz wraca na stary adres bez
// tego parametru, a na telefonie to podstawowy gest. Dlatego sekcja pokoi sprawdza
// tę pamięć i sama przechodzi na właściwy adres. Dane tylko tej karty i tylko tego
// gościa: nic nie trafia na serwer i nie wpływa na listę innych osób.
//
// Pamięć wygasa po tym samym czasie co znacznik oferty po stronie serwera, żeby
// oferta, która po kwadransie naprawdę wróciła, nie była ukrywana bez końca.

import { MAX_REFUSED_OFFERS, OFFER_FINGERPRINT_RE } from "./offer-fingerprint";

export interface RefusedStay {
  hotelId: string;
  checkin: string;
  checkout: string;
}

interface StoredRefusal {
  fingerprint: string;
  at: number;
}

const REFUSAL_LIFETIME_MS = 30 * 60 * 1000;
const storageKey = ({ hotelId, checkin, checkout }: RefusedStay) =>
  `ht:refused-offers:${hotelId}:${checkin}:${checkout}`;

function readStored(stay: RefusedStay): StoredRefusal[] {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(storageKey(stay)) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    const oldestAllowed = Date.now() - REFUSAL_LIFETIME_MS;
    return (parsed as StoredRefusal[]).filter(
      (entry) =>
        typeof entry?.fingerprint === "string" &&
        OFFER_FINGERPRINT_RE.test(entry.fingerprint) &&
        typeof entry.at === "number" &&
        entry.at >= oldestAllowed,
    );
  } catch {
    return [];
  }
}

export function readRefusedOffers(stay: RefusedStay): string[] {
  return readStored(stay).map((entry) => entry.fingerprint);
}

/** Dopisuje odmowę i zwraca aktualną listę. Brak dostępu do pamięci nie przeszkadza. */
export function rememberRefusedOffer(stay: RefusedStay, fingerprint: string): string[] {
  const entries = [
    ...readStored(stay).filter((entry) => entry.fingerprint !== fingerprint),
    { fingerprint, at: Date.now() },
  ].slice(-MAX_REFUSED_OFFERS);
  try {
    sessionStorage.setItem(storageKey(stay), JSON.stringify(entries));
  } catch {
    // Tryb prywatny albo webview bez pamięci: link powrotu i tak niesie tę odmowę.
  }
  return entries.map((entry) => entry.fingerprint);
}

/** Ten sam adres z listą odrzuconych ofert. Pozostałe parametry i kotwica bez zmian. */
export function withRefusedOffers(href: string, fingerprints: readonly string[]): string {
  if (fingerprints.length === 0) return href;
  const url = new URL(href, "http://helptravel.invalid");
  url.searchParams.set("refused", fingerprints.join(","));
  return `${url.pathname}${url.search}${url.hash}`;
}
