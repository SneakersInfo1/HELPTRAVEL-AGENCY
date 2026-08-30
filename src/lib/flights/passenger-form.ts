// Walidacja formularza pasażerów (/loty/pasazerowie) — funkcja CZYSTA.
//
// Wydzielona ze strony, bo była jedynym miejscem decydującym o tym, czy
// żądanie prebooka w ogóle poleci, a jako kod wewnątrz komponentu klienckiego
// nie dało się jej przetestować. Teraz strona woła to samo, co testy.
//
// Reguła długości imienia i nazwiska pochodzi z `name-policy.ts` — tego samego
// modułu, z którego korzysta schemat serwerowy. Front NIE jest jedyną ochroną:
// druga bramka stoi w `FlightPrebookInputSchema`.

import {
  NAME_TOO_SHORT_FIRST,
  NAME_TOO_SHORT_LAST,
  isNameLongEnough,
} from "./name-policy";

export type FlightFormGender = "M" | "F" | "X" | "";
export type FlightFormDocType = "passport" | "id";
export type FlightFormPaxType = "ADT" | "CHD" | "INF";

export interface PassengerFormPax {
  type: FlightFormPaxType;
  firstName: string;
  lastName: string;
  birthday: string;
  gender: FlightFormGender;
  nationality: string;
  documentType: FlightFormDocType;
  documentNumber: string;
  documentExpiry: string;
}

export interface PassengerFormContact {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  phoneCountryCode: string;
}

export interface PassengerFormInput {
  pax: PassengerFormPax[];
  contact: PassengerFormContact;
  acceptTerms: boolean;
  /** Ostatnia data podróży — dokument musi być ważny PO niej. */
  lastTravelDate?: string;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Sprawdza jedno pole z imieniem/nazwiskiem.
 *
 * Puste pole i pole za krótkie to DWIE RÓŻNE sytuacje: pierwsza znaczy „nie
 * wypełniłeś", druga „wypełniłeś, ale przewoźnik tego nie przyjmie". Wspólny
 * komunikat kazałby osobie o nazwisku „Li" szukać literówki tam, gdzie jej nie
 * ma.
 */
function nameError(value: string, kind: "first" | "last"): string | null {
  if (!value.trim()) return kind === "first" ? "Wpisz imię" : "Wpisz nazwisko";
  if (!isNameLongEnough(value)) return kind === "first" ? NAME_TOO_SHORT_FIRST : NAME_TOO_SHORT_LAST;
  return null;
}

/**
 * Zwraca mapę `identyfikator pola → komunikat`. Pusta mapa = można wysyłać.
 *
 * ZWRACA, a nie zapisuje w stanie — wołający potrzebuje wyniku natychmiast,
 * żeby przewinąć do pierwszego błędnego pola. Kolejność kluczy odpowiada
 * kolejności pól na stronie, więc pierwszy klucz to pierwszy błąd od góry.
 *
 * Niczego nie mutuje: dane, które użytkownik już wpisał, wychodzą stąd
 * nietknięte.
 */
export function collectPassengerFormErrors(input: PassengerFormInput): Record<string, string> {
  const { pax, contact, acceptTerms, lastTravelDate } = input;
  const e: Record<string, string> = {};

  pax.forEach((p, i) => {
    const first = nameError(p.firstName, "first");
    if (first) e[`p${i}.firstName`] = first;
    const last = nameError(p.lastName, "last");
    if (last) e[`p${i}.lastName`] = last;
    if (!ISO_DATE_RE.test(p.birthday)) e[`p${i}.birthday`] = "Wpisz datę urodzenia";
    if (!p.gender) e[`p${i}.gender`] = "Wybierz płeć";
    if (p.nationality.length !== 2) e[`p${i}.nationality`] = "Kod kraju (2 litery)";
    if (p.documentNumber.trim().length < 3) e[`p${i}.documentNumber`] = "Wpisz numer dokumentu";
    if (!ISO_DATE_RE.test(p.documentExpiry)) e[`p${i}.documentExpiry`] = "Wpisz datę ważności";
    else if (lastTravelDate && p.documentExpiry <= lastTravelDate)
      e[`p${i}.documentExpiry`] = "Dokument musi być ważny po dacie podróży";
  });

  const cFirst = nameError(contact.firstName, "first");
  if (cFirst) e["c.firstName"] = cFirst;
  const cLast = nameError(contact.lastName, "last");
  if (cLast) e["c.lastName"] = cLast;
  if (!EMAIL_RE.test(contact.email)) e["c.email"] = "Wpisz poprawny e-mail";
  if (contact.phoneNumber.replace(/\D/g, "").length < 6) e["c.phoneNumber"] = "Wpisz numer telefonu";
  if (!acceptTerms) e["terms"] = "Zaakceptuj regulamin i politykę prywatności";

  return e;
}
