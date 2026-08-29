"use client";

// /loty/pasazerowie — dane pasażerów + kontakt. Submit → /api/flights/prebook
// → zapis sessionId/secretKey/widgetEnv → /loty/platnosc.
//
// ── ZMIANY Flights V2 (2026-08-29) ───────────────────────────────────────────
//
// 1. BRAMKA CENY. Do tej pory ta strona robiła
//    `verifiedTotal: json.price ?? flow.verifiedTotal`, czyli po cichu
//    NADPISYWAŁA kwotę zaakceptowaną przez klienta kwotą z prebooka. Klient,
//    który zgodził się na 2 727 zł, mógł zobaczyć na płatności 2 900 zł i tyle
//    zapłacić, nie dostawszy ani jednego komunikatu. Teraz wysyłamy
//    `acceptedTotal` do serwera, a serwer przy rozjeździe NIE ODDAJE
//    `secretKey` i zwraca 409 — my pokazujemy modal i dopiero po akceptacji
//    ponawiamy prebook z nową kwotą.
//
// 2. AUTO-SCROLL DO BŁĘDU faktycznie działa. Poprzednia wersja czytała stan
//    `errors` PO wywołaniu `setErrors` w tym samym renderze — czyli wartość
//    sprzed walidacji. Przy pierwszym nieudanym submicie `firstKey` był
//    `undefined` i strona nie przewijała się nigdzie. Teraz walidacja zwraca
//    mapę błędów, a nie tylko boolean.
//
// 3. AUTOFILL. 17 pól nie miało ani jednego `autocomplete`, a telefon był
//    `type="text"` (pełna klawiatura QWERTY na komórce). Uzupełnione zgodnie
//    z HTML AUTOFILL spec — `section-pax-N` izoluje pasażerów, żeby
//    przeglądarka nie wstawiła tego samego nazwiska wszystkim.
//
// 4. KWOTA I CTA NA MOBILE. Pomiar przed: „Razem" na 2 047 px scrolla, przycisk
//    na 2 579 px. Teraz sticky pasek na dole; panel podsumowania zostaje na
//    desktopie.
//
// 5. IDEMPOTENCY-KEY. Serwer obsługiwał nagłówek od początku, ale front go nie
//    wysyłał — dwa submity dawały dwa prebooki (dwa locki taryfy u dostawcy).

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Lock } from "lucide-react";

import { track } from "@/lib/analytics/track";
import { averagePerTraveller, formatFlightPrice, formatFlightPriceExact } from "@/lib/flights/money";
import { FLIGHT_SHELL_FORM } from "@/lib/flights/layout";
import { loadFlightFlow, patchFlightFlow, flowTravellers, type FlightFlow } from "@/lib/flights/flow-storage";
import { FlightItinerarySummary } from "@/components/flights/flight-itinerary-summary";
import { FlightPriceChangeDialog } from "@/components/flights/flight-price-change-dialog";
import { FlightStepNav } from "@/components/flights/flight-step-nav";
import { FLIGHT_STICKY_CTA_PAD, FlightStickyCta } from "@/components/flights/flight-sticky-cta";

type Gender = "M" | "F" | "X";
type DocType = "passport" | "id";
type PaxType = "ADT" | "CHD" | "INF";

interface PaxForm {
  type: PaxType;
  firstName: string;
  lastName: string;
  birthday: string;
  gender: Gender | "";
  nationality: string;
  documentType: DocType;
  documentNumber: string;
  documentExpiry: string;
}

interface ContactForm {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  phoneCountryCode: string;
}

function emptyPax(type: PaxType): PaxForm {
  return { type, firstName: "", lastName: "", birthday: "", gender: "", nationality: "PL", documentType: "passport", documentNumber: "", documentExpiry: "" };
}

const PAX_LABEL: Record<PaxType, string> = { ADT: "Dorosły", CHD: "Dziecko", INF: "Niemowlę" };

/**
 * Tytuł grzecznościowy z płci i typu pasażera.
 *
 * Poprzednia wersja robiła `gender === "F" ? "MRS" : "MR"` — czyli osoba
 * z płcią „X" jechała do dostawcy jako „MR", a dziecko jako „MR"/„MRS".
 * `undefined` jest bezpieczniejsze niż zgadywanie: pole jest u dostawcy
 * opcjonalne, a błędny tytuł na bilecie bywa powodem odmowy odprawy.
 */
function titleFor(gender: Gender | "", type: PaxType): "MR" | "MRS" | "MISS" | undefined {
  if (type === "ADT") {
    if (gender === "M") return "MR";
    if (gender === "F") return "MRS";
    return undefined;
  }
  if (gender === "F") return "MISS";
  if (gender === "M") return "MR";
  return undefined;
}

export default function PassengersPage() {
  const router = useRouter();
  const [flow, setFlow] = useState<FlightFlow | null>(null);
  const [pax, setPax] = useState<PaxForm[]>([]);
  const [contact, setContact] = useState<ContactForm>({ firstName: "", lastName: "", email: "", phoneNumber: "", phoneCountryCode: "48" });
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [priceChange, setPriceChange] = useState<{ acceptedTotal: number; lockedTotal: number; currency: string } | null>(null);
  // Klucz idempotencji per PRÓBA wysyłki — ten sam przy powtórzeniu tego samego
  // żądania (double submit), nowy dopiero gdy zmienia się treść (np. po
  // akceptacji nowej ceny). Bez niego dwa kliknięcia = dwa locki u dostawcy.
  const idemKeyRef = useRef<string>("");

  // Wczytaj kontekst przepływu; brak → wróć do strony głównej.
  useEffect(() => {
    const f = loadFlightFlow();
    if (!f) {
      router.replace("/?tab=loty");
      return;
    }
    setFlow(f);
    const list: PaxForm[] = [
      ...Array.from({ length: f.adults }, () => emptyPax("ADT")),
      ...Array.from({ length: f.children }, () => emptyPax("CHD")),
      ...Array.from({ length: f.infants }, () => emptyPax("INF")),
    ];
    setPax(list);
    track("flight_passenger_form_start", { offer_id: f.offerId });
  }, [router]);

  const lastTravelDate = useMemo(() => (flow?.ret && flow.ret > flow.depart ? flow.ret : flow?.depart), [flow]);

  function setPaxField(i: number, field: keyof PaxForm, value: string) {
    setPax((prev) => prev.map((p, idx) => (idx === i ? { ...p, [field]: value } : p)));
  }

  /** Zwraca mapę błędów (pustą = OK). ZWRACA, a nie tylko zapisuje w stanie —
   *  wołający potrzebuje wyniku NATYCHMIAST, żeby przewinąć do pierwszego pola. */
  function collectErrors(): Record<string, string> {
    const e: Record<string, string> = {};
    pax.forEach((p, i) => {
      if (!p.firstName.trim()) e[`p${i}.firstName`] = "Wpisz imię";
      if (!p.lastName.trim()) e[`p${i}.lastName`] = "Wpisz nazwisko";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(p.birthday)) e[`p${i}.birthday`] = "Wpisz datę urodzenia";
      if (!p.gender) e[`p${i}.gender`] = "Wybierz płeć";
      if (p.nationality.length !== 2) e[`p${i}.nationality`] = "Kod kraju (2 litery)";
      if (p.documentNumber.trim().length < 3) e[`p${i}.documentNumber`] = "Wpisz numer dokumentu";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(p.documentExpiry)) e[`p${i}.documentExpiry`] = "Wpisz datę ważności";
      else if (lastTravelDate && p.documentExpiry <= lastTravelDate) e[`p${i}.documentExpiry`] = "Dokument musi być ważny po dacie podróży";
    });
    if (!contact.firstName.trim()) e["c.firstName"] = "Wpisz imię";
    if (!contact.lastName.trim()) e["c.lastName"] = "Wpisz nazwisko";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact.email)) e["c.email"] = "Wpisz poprawny e-mail";
    if (contact.phoneNumber.replace(/\D/g, "").length < 6) e["c.phoneNumber"] = "Wpisz numer telefonu";
    if (!acceptTerms) e["terms"] = "Zaakceptuj regulamin i politykę prywatności";
    return e;
  }

  /** Wysyła prebook z podaną kwotą zaakceptowaną. Wydzielone, bo wołamy to
   *  dwa razy: przy pierwszym submicie i po akceptacji nowej ceny w modalu. */
  async function submitPrebook(acceptedTotal: number, acceptedCurrency: string, freshIdemKey: boolean) {
    if (!flow) return;
    if (freshIdemKey || !idemKeyRef.current) {
      idemKeyRef.current = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now());
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/flights/prebook", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idemKeyRef.current },
        body: JSON.stringify({
          offerId: flow.offerId,
          lastTravelDate,
          acceptedTotal,
          acceptedCurrency,
          // Migawka trasy WYŁĄCZNIE do maila i strony potwierdzenia — nie ma
          // wpływu ani na cenę, ani na booking (patrz komentarz przy
          // `FlightItinerarySnapshotSchema`). Bez niej mail potwierdzający nie
          // miał czym wypełnić trasy, dat, lotnisk, taryfy ani bagażu.
          itinerary: {
            legs: flow.offer.legs.slice(0, 2).map((l) => ({
              direction: l.direction,
              originCode: l.originCode,
              destinationCode: l.destinationCode,
              departureTime: l.departureTime,
              arrivalTime: l.arrivalTime,
              durationMinutes: l.durationMinutes,
              stops: l.stops,
              carrier: l.carriers[0] ?? "",
            })),
            fareName: flow.fare?.name,
            hasCarryOnBag: flow.fare?.hasCarryOnBag,
            hasCheckedBag: flow.fare?.hasCheckedBag,
          },
          contact: {
            firstName: contact.firstName.trim(),
            lastName: contact.lastName.trim(),
            email: contact.email.trim(),
            phoneNumber: contact.phoneNumber.replace(/[^\d]/g, ""),
            phoneCountryCode: contact.phoneCountryCode.replace(/\D/g, "") || "48",
          },
          passengers: pax.map((p) => ({
            title: titleFor(p.gender, p.type),
            firstName: p.firstName.trim(),
            lastName: p.lastName.trim(),
            birthday: p.birthday,
            gender: p.gender,
            nationality: p.nationality.toUpperCase(),
            type: p.type,
            documentType: p.documentType,
            documentNumber: p.documentNumber.trim(),
            documentExpiry: p.documentExpiry,
            documentIssueCountry: p.nationality.toUpperCase(),
          })),
        }),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        // Rozjazd kwoty — serwer świadomie NIE oddał sesji płatności.
        if (json.error === "PRICE_CHANGED" && typeof json.lockedTotal === "number") {
          track("flight_prebook_price_change", {
            offer_id: flow.offerId,
            accepted_price: json.acceptedTotal,
            locked_price: json.lockedTotal,
            currency: json.currency,
          });
          setPriceChange({
            acceptedTotal: json.acceptedTotal ?? acceptedTotal,
            lockedTotal: json.lockedTotal,
            currency: json.currency ?? acceptedCurrency,
          });
          return;
        }
        if (json.error === "CURRENCY_MISMATCH") {
          setSubmitError("Rezerwacja wróciła w innej walucie niż pokazana. Rozpocznij rezerwację od nowa.");
          return;
        }
        if (json.error === "OFFER_UNAVAILABLE") {
          setSubmitError("Ta oferta wygasła. Wróć do wyników i wybierz lot ponownie.");
          return;
        }
        track("flight_payment_error", { code: String(json.error ?? "prebook_failed"), http_status: res.status });
        setSubmitError(json.message || "Nie udało się przygotować rezerwacji. Spróbuj ponownie.");
        return;
      }

      track("passenger_step_completed", { offer_id: flow.offerId, passengers: pax.length });
      track("flight_prebook", { offer_id: flow.offerId, price: json.price, currency: json.currency });
      // `lockedTotal` — kwota, którą realnie obciąży karta. `selectedTotal`
      // zostaje nietknięte: to ślad tego, na co klient się zgodził. Strona
      // płatności i tak pobiera kwotę z serwera, te pola są dla podsumowania.
      patchFlightFlow({
        sessionId: json.sessionId,
        secretKey: json.secretKey,
        widgetEnv: json.widgetEnv,
        lockedTotal: json.price,
        lockedCurrency: json.currency,
      });
      router.push("/loty/platnosc");
    } catch {
      setSubmitError("Problem z połączeniem. Spróbuj ponownie.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(ev?: React.FormEvent) {
    ev?.preventDefault();
    if (!flow || submitting) return;
    const e = collectErrors();
    setErrors(e);
    const firstKey = Object.keys(e)[0];
    if (firstKey) {
      // `scroll-margin-top` na kontenerze pola (klasa `scroll-mt-28`) — bez
      // tego sticky header przykrywał pole, do którego właśnie przewinęliśmy.
      const el = document.getElementById(`field-${firstKey}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.querySelector<HTMLElement>("input,select")?.focus({ preventScroll: true });
      return;
    }
    // Bez znanej kwoty NIE RUSZAMY prebooka. `acceptedTotal` jest bramką zgody,
    // więc wysłanie tam zera byłoby deklaracją „zgadzam się na 0 zł" — serwer
    // odrzuciłby ją jako `invalid_body`, a użytkownik zobaczyłby techniczny
    // komunikat zamiast prawdy: że oferta straciła cenę i trzeba wybrać nową.
    if (typeof flow.selectedTotal !== "number" || flow.selectedTotal <= 0) {
      setSubmitError("Nie znamy aktualnej ceny tej oferty. Wróć do wyników i wybierz lot ponownie.");
      return;
    }
    void submitPrebook(flow.selectedTotal, flow.selectedCurrency ?? "PLN", true);
  }

  if (!flow) {
    return <main className={`${FLIGHT_SHELL_FORM} py-12 text-sm text-ink-muted`}>Wczytywanie…</main>;
  }

  const travellers = flowTravellers(flow);
  const total = flow.selectedTotal;
  const avg = averagePerTraveller(total, travellers);
  // Rozmiar pisma pól ustawiany na KONTENERZE — `text-*` na <input>/<select>
  // w tym repo nie działa (reset `input { font-size: inherit }` stoi poza
  // warstwami CSS i bije utility Tailwinda). Pola dziedziczą 16 px z body,
  // co przy okazji chroni przed zoomem na iOS.
  const inputCls = "h-11 w-full rounded-md border border-line bg-surface-raised px-3 text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";
  const labelCls = "text-xs font-medium text-ink-muted";
  const errCls = "mt-1 text-xs font-medium text-error";
  const fieldCls = "scroll-mt-28";

  return (
    <main className={`${FLIGHT_SHELL_FORM} py-6 sm:py-8 ${FLIGHT_STICKY_CTA_PAD}`}>
      <FlightStepNav current="dane" className="mb-4" />

      <h1 className="text-2xl font-bold text-ink sm:text-3xl">Dane podróżnych</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Wpisz imiona i nazwiska dokładnie tak, jak w dokumencie podróży — przewoźnik nie pozwala ich potem zmienić.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          {pax.map((p, i) => (
            <fieldset key={i} className="rounded-lg border border-line bg-surface-raised p-4 sm:p-5">
              <legend className="px-1 text-sm font-bold text-ink">
                Pasażer {i + 1} · {PAX_LABEL[p.type]}
              </legend>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div id={`field-p${i}.firstName`} className={fieldCls}>
                  <label className={labelCls} htmlFor={`p${i}-first`}>Imię (jak w dokumencie)</label>
                  <input
                    id={`p${i}-first`}
                    className={inputCls}
                    autoComplete={`section-pax-${i} given-name`}
                    value={p.firstName}
                    onChange={(e) => setPaxField(i, "firstName", e.target.value)}
                    aria-invalid={Boolean(errors[`p${i}.firstName`])}
                    aria-describedby={errors[`p${i}.firstName`] ? `err-p${i}.firstName` : undefined}
                  />
                  {errors[`p${i}.firstName`] && (
                    <p id={`err-p${i}.firstName`} role="alert" className={errCls}>
                      {errors[`p${i}.firstName`]}
                    </p>
                  )}
                </div>
                <div id={`field-p${i}.lastName`} className={fieldCls}>
                  <label className={labelCls} htmlFor={`p${i}-last`}>Nazwisko</label>
                  <input
                    id={`p${i}-last`}
                    className={inputCls}
                    autoComplete={`section-pax-${i} family-name`}
                    value={p.lastName}
                    onChange={(e) => setPaxField(i, "lastName", e.target.value)}
                    aria-invalid={Boolean(errors[`p${i}.lastName`])}
                    aria-describedby={errors[`p${i}.lastName`] ? `err-p${i}.lastName` : undefined}
                  />
                  {errors[`p${i}.lastName`] && (
                    <p id={`err-p${i}.lastName`} role="alert" className={errCls}>
                      {errors[`p${i}.lastName`]}
                    </p>
                  )}
                </div>
                <div id={`field-p${i}.birthday`} className={fieldCls}>
                  <label className={labelCls} htmlFor={`p${i}-bday`}>Data urodzenia</label>
                  <input
                    id={`p${i}-bday`}
                    type="date"
                    className={inputCls}
                    autoComplete={`section-pax-${i} bday`}
                    value={p.birthday}
                    onChange={(e) => setPaxField(i, "birthday", e.target.value)}
                    aria-invalid={Boolean(errors[`p${i}.birthday`])}
                    aria-describedby={errors[`p${i}.birthday`] ? `err-p${i}.birthday` : undefined}
                  />
                  {errors[`p${i}.birthday`] && (
                    <p id={`err-p${i}.birthday`} role="alert" className={errCls}>
                      {errors[`p${i}.birthday`]}
                    </p>
                  )}
                </div>
                <div id={`field-p${i}.gender`} className={fieldCls}>
                  <label className={labelCls} htmlFor={`p${i}-gender`}>Płeć</label>
                  <select
                    id={`p${i}-gender`}
                    className={inputCls}
                    value={p.gender}
                    onChange={(e) => setPaxField(i, "gender", e.target.value)}
                    aria-invalid={Boolean(errors[`p${i}.gender`])}
                    aria-describedby={errors[`p${i}.gender`] ? `err-p${i}.gender` : undefined}
                  >
                    <option value="">—</option>
                    <option value="M">Mężczyzna</option>
                    <option value="F">Kobieta</option>
                    <option value="X">Inna</option>
                  </select>
                  {errors[`p${i}.gender`] && (
                    <p id={`err-p${i}.gender`} role="alert" className={errCls}>
                      {errors[`p${i}.gender`]}
                    </p>
                  )}
                </div>
                <div id={`field-p${i}.nationality`} className={fieldCls}>
                  <label className={labelCls} htmlFor={`p${i}-nat`}>Obywatelstwo (kod, np. PL)</label>
                  <input
                    id={`p${i}-nat`}
                    className={inputCls}
                    maxLength={2}
                    autoCapitalize="characters"
                    autoComplete={`section-pax-${i} country`}
                    value={p.nationality}
                    onChange={(e) => setPaxField(i, "nationality", e.target.value.toUpperCase())}
                    aria-invalid={Boolean(errors[`p${i}.nationality`])}
                    aria-describedby={errors[`p${i}.nationality`] ? `err-p${i}.nationality` : undefined}
                  />
                  {errors[`p${i}.nationality`] && (
                    <p id={`err-p${i}.nationality`} role="alert" className={errCls}>
                      {errors[`p${i}.nationality`]}
                    </p>
                  )}
                </div>
                <div>
                  <label className={labelCls} htmlFor={`p${i}-doctype`}>Dokument</label>
                  <select
                    id={`p${i}-doctype`}
                    className={inputCls}
                    value={p.documentType}
                    onChange={(e) => setPaxField(i, "documentType", e.target.value)}
                  >
                    <option value="passport">Paszport</option>
                    <option value="id">Dowód osobisty</option>
                  </select>
                </div>
                <div id={`field-p${i}.documentNumber`} className={fieldCls}>
                  <label className={labelCls} htmlFor={`p${i}-docnum`}>Numer dokumentu</label>
                  <input
                    id={`p${i}-docnum`}
                    className={inputCls}
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                    value={p.documentNumber}
                    onChange={(e) => setPaxField(i, "documentNumber", e.target.value.toUpperCase())}
                    aria-invalid={Boolean(errors[`p${i}.documentNumber`])}
                    aria-describedby={errors[`p${i}.documentNumber`] ? `err-p${i}.documentNumber` : undefined}
                  />
                  {errors[`p${i}.documentNumber`] && (
                    <p id={`err-p${i}.documentNumber`} role="alert" className={errCls}>
                      {errors[`p${i}.documentNumber`]}
                    </p>
                  )}
                </div>
                <div id={`field-p${i}.documentExpiry`} className={fieldCls}>
                  <label className={labelCls} htmlFor={`p${i}-docexp`}>Ważny do</label>
                  <input
                    id={`p${i}-docexp`}
                    type="date"
                    className={inputCls}
                    value={p.documentExpiry}
                    onChange={(e) => setPaxField(i, "documentExpiry", e.target.value)}
                    aria-invalid={Boolean(errors[`p${i}.documentExpiry`])}
                    aria-describedby={errors[`p${i}.documentExpiry`] ? `err-p${i}.documentExpiry` : undefined}
                  />
                  {errors[`p${i}.documentExpiry`] && (
                    <p id={`err-p${i}.documentExpiry`} role="alert" className={errCls}>
                      {errors[`p${i}.documentExpiry`]}
                    </p>
                  )}
                </div>
              </div>
            </fieldset>
          ))}

          {/* Kontakt */}
          <fieldset className="rounded-lg border border-line bg-surface-raised p-4 sm:p-5">
            <legend className="px-1 text-sm font-bold text-ink">Dane kontaktowe</legend>
            <p className="mt-1 text-xs text-ink-muted">Na ten adres wyślemy potwierdzenie rezerwacji i bilety.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div id="field-c.firstName" className={fieldCls}>
                <label className={labelCls} htmlFor="c-first">Imię</label>
                <input id="c-first" className={inputCls} autoComplete="section-contact given-name" value={contact.firstName} onChange={(e) => setContact({ ...contact, firstName: e.target.value })} aria-invalid={Boolean(errors["c.firstName"])} aria-describedby={errors["c.firstName"] ? "err-c.firstName" : undefined} />
                {errors["c.firstName"] && <p id="err-c.firstName" role="alert" className={errCls}>{errors["c.firstName"]}</p>}
              </div>
              <div id="field-c.lastName" className={fieldCls}>
                <label className={labelCls} htmlFor="c-last">Nazwisko</label>
                <input id="c-last" className={inputCls} autoComplete="section-contact family-name" value={contact.lastName} onChange={(e) => setContact({ ...contact, lastName: e.target.value })} aria-invalid={Boolean(errors["c.lastName"])} aria-describedby={errors["c.lastName"] ? "err-c.lastName" : undefined} />
                {errors["c.lastName"] && <p id="err-c.lastName" role="alert" className={errCls}>{errors["c.lastName"]}</p>}
              </div>
              <div id="field-c.email" className={fieldCls}>
                <label className={labelCls} htmlFor="c-email">E-mail</label>
                <input id="c-email" type="email" inputMode="email" autoComplete="section-contact email" className={inputCls} value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} aria-invalid={Boolean(errors["c.email"])} aria-describedby={errors["c.email"] ? "err-c.email" : undefined} />
                {errors["c.email"] && <p id="err-c.email" role="alert" className={errCls}>{errors["c.email"]}</p>}
              </div>
              <div id="field-c.phoneNumber" className={fieldCls}>
                <label className={labelCls} htmlFor="c-phone">Telefon</label>
                <div className="flex gap-2">
                  <input
                    className={`${inputCls} w-16`}
                    type="tel"
                    inputMode="tel"
                    autoComplete="section-contact tel-country-code"
                    value={contact.phoneCountryCode}
                    onChange={(e) => setContact({ ...contact, phoneCountryCode: e.target.value })}
                    aria-label="Kod kraju"
                  />
                  <input
                    id="c-phone"
                    className={inputCls}
                    type="tel"
                    inputMode="tel"
                    autoComplete="section-contact tel-national"
                    value={contact.phoneNumber}
                    onChange={(e) => setContact({ ...contact, phoneNumber: e.target.value })}
                    aria-invalid={Boolean(errors["c.phoneNumber"])} aria-describedby={errors["c.phoneNumber"] ? "err-c.phoneNumber" : undefined}
                  />
                </div>
                {errors["c.phoneNumber"] && <p id="err-c.phoneNumber" role="alert" className={errCls}>{errors["c.phoneNumber"]}</p>}
              </div>
            </div>
          </fieldset>

          {/* Zgody — poza panelem podsumowania, żeby na mobile nie lądowały
              dopiero za sticky paskiem. */}
          <div id="field-terms" className={`rounded-lg border border-line bg-surface-raised p-4 ${fieldCls}`}>
            <label className="flex cursor-pointer items-start gap-2.5 text-xs text-ink">
              <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 rounded border-line text-brand focus:ring-brand" />
              <span>
                Akceptuję <Link href="/regulamin" className="font-medium underline underline-offset-2" target="_blank"><span className="text-brand">Regulamin</span></Link> i{" "}
                <Link href="/polityka-prywatnosci" className="font-medium underline underline-offset-2" target="_blank"><span className="text-brand">Politykę prywatności</span></Link>.
              </span>
            </label>
            {errors["terms"] && <p role="alert" className={errCls}>{errors["terms"]}</p>}
          </div>

          <div className="hidden lg:block">
            <button
              onClick={() => router.back()}
              type="button"
              className="inline-flex h-11 items-center gap-1.5 rounded-md px-3 text-sm font-semibold text-ink-muted transition hover:bg-surface-sunken hover:text-ink active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <ArrowLeft aria-hidden className="h-4 w-4" strokeWidth={2} />
              Wróć do taryf
            </button>
          </div>
        </div>

        {/* Panel podsumowania — desktop. */}
        <aside className="hidden space-y-4 lg:sticky lg:top-24 lg:block lg:h-fit">
          {flow.offer && (
            <div className="rounded-lg border border-line bg-surface-raised p-5">
              <h2 className="text-sm font-bold text-ink">Twój lot</h2>
              <FlightItinerarySummary offer={flow.offer} depart={flow.depart} ret={flow.ret} className="mt-2" />
            </div>
          )}
          <div className="rounded-lg border border-line bg-surface-raised p-5">
            <h2 className="text-sm font-bold text-ink">Podsumowanie</h2>
            <div className="mt-3 space-y-1.5 text-sm text-ink-muted">
              <div className="flex justify-between"><span>Podróżni</span><span className="font-medium text-ink">{travellers}</span></div>
              {flow.fare && (
                <>
                  <div className="flex justify-between"><span>Taryfa</span><span className="font-medium text-ink">{flow.fare.name}</span></div>
                  <div className="flex justify-between text-xs">
                    <span>Bagaż</span>
                    <span>
                      {[flow.fare.hasCarryOnBag ? "podręczny" : null, flow.fare.hasCheckedBag ? "rejestrowany" : null]
                        .filter(Boolean)
                        .join(" + ") || "wg taryfy"}
                    </span>
                  </div>
                </>
              )}
            </div>
            <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
              <span className="text-sm font-semibold text-ink">Razem</span>
              <span className="text-xl font-bold text-accent">{formatFlightPriceExact(total, flow.selectedCurrency)}</span>
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              Cena za wszystkich podróżnych, wł. podatków i opłat.
              {travellers > 1 && avg !== null ? ` Śr. ${formatFlightPrice(avg)}/os.` : ""}
            </p>

            <button
              type="submit"
              disabled={submitting}
              className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-md bg-brand font-bold text-white transition hover:opacity-90 active:scale-[0.99] disabled:opacity-60 motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <span className="text-sm">{submitting ? "Przygotowuję płatność…" : "Przejdź do płatności →"}</span>
            </button>
            <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-xs text-ink-muted">
              <Lock aria-hidden className="h-3.5 w-3.5" strokeWidth={2} />
              Cena i dostępność potwierdzane przed płatnością
            </p>
            {submitError && <p className="mt-2 rounded-md bg-error/5 px-3 py-2 text-xs font-medium text-error">{submitError}</p>}
          </div>
        </aside>
      </form>

      <FlightStickyCta
        amount={formatFlightPriceExact(total, flow.selectedCurrency)}
        amountNote={`za ${travellers} ${travellers === 1 ? "podróżnego" : "podróżnych"} · wł. opłat`}
        actionLabel={submitting ? "Chwila…" : "Do płatności"}
        onAction={() => handleSubmit()}
        disabled={submitting}
      >
        {submitError && (
          <p className="border-b border-line bg-error/5 px-4 py-2 text-xs font-medium text-error">{submitError}</p>
        )}
      </FlightStickyCta>

      {priceChange && (
        <FlightPriceChangeDialog
          oldTotal={priceChange.acceptedTotal}
          newTotal={priceChange.lockedTotal}
          currency={priceChange.currency}
          source="prebook"
          busy={submitting}
          onReject={() => setPriceChange(null)}
          onAccept={() => {
            const pc = priceChange;
            setPriceChange(null);
            // Zapisz nową kwotę jako zaakceptowaną i ponów prebook. Nowy klucz
            // idempotencji, bo to inne żądanie niż poprzednie (inna zgoda).
            patchFlightFlow({ selectedTotal: pc.lockedTotal, selectedCurrency: pc.currency });
            setFlow((f) => (f ? { ...f, selectedTotal: pc.lockedTotal, selectedCurrency: pc.currency } : f));
            void submitPrebook(pc.lockedTotal, pc.currency, true);
          }}
        />
      )}
    </main>
  );
}
