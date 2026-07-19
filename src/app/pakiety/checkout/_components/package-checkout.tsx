"use client";

// Checkout pakietowy — klient. DWA odrębne checkouty (§4, wzorzec
// Booking/lastminute): [1] Dane podróżnych → start sagi + HOLD lotu (bez
// płatności) + prebook hotelu → [2] płatność HOTEL (PaymentSlot) → return →
// [3] płatność LOT → return → potwierdzenie. Uczciwość: dwie transakcje,
// descriptor NUITEE TRAVEL komunikowany wprost; zmiana ceny lotu = jawny
// banner z decyzją usera (nigdy cicha).
//
// Sekrety płatności: WYŁĄCZNIE przeglądarka (sessionStorage na czas redirectu
// widgetu — jak client_secret Stripe); nigdy w naszej bazie. Utrata sesji po
// opłaceniu hotelu → uczciwy ekran (hotel bezpieczny: deadline sagi sam
// anuluje i zwraca pieniądze — cron package-deadlines).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { track } from "@/lib/analytics/track";
import { formatPLN } from "@/lib/money";

import { PaymentSlot, type PaymentSlotPrebook } from "@/app/hotele/rezerwacja/_components/payment-slot";

/* ── Kontekst i typy ───────────────────────────────────────────────────── */

export interface CheckoutOfferParams {
  destination: string;
  hotelId: string;
  hotelName: string;
  rateId: string;
  flightOfferId: string;
  dateFrom: string;
  dateTo: string;
  adults: number;
  hotelPln: number;
  flightPln: number;
}

interface PaxForm {
  firstName: string;
  lastName: string;
  birthday: string;
  gender: "M" | "F" | "";
  nationality: string;
  documentType: "passport" | "id";
  documentNumber: string;
  documentExpiry: string;
  documentIssueCountry: string;
}

interface ContactForm {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  phoneCountryCode: string;
}

const emptyPax = (): PaxForm => ({
  firstName: "",
  lastName: "",
  birthday: "",
  gender: "",
  nationality: "PL",
  documentType: "passport",
  documentNumber: "",
  documentExpiry: "",
  documentIssueCountry: "PL",
});

/* ── Transliteracja (spec 3.5: API nie transliteruje — my tak) ─────────── */

const PL_MAP: Record<string, string> = {
  ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z",
  Ą: "A", Ć: "C", Ę: "E", Ł: "L", Ń: "N", Ó: "O", Ś: "S", Ź: "Z", Ż: "Z",
};
const NAME_RE = /^[A-Za-z][A-Za-z' -]*$/;

function translit(s: string): string {
  return s
    .split("")
    .map((ch) => PL_MAP[ch] ?? ch)
    .join("")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/* ── Sekrety płatności na czas redirectów widgetu ──────────────────────── */

interface StoredPay {
  flight?: { secretKey: string; amount: number | null; currency: string; widgetEnv: "live" | "sandbox" };
  hotel?: { secretKey: string; amount: number | null; currency: string; widgetEnv: "live" | "sandbox" };
}

const payKey = (sagaId: string) => `pkgpay:${sagaId}`;
function loadPay(sagaId: string): StoredPay {
  try {
    return JSON.parse(sessionStorage.getItem(payKey(sagaId)) ?? "{}") as StoredPay;
  } catch {
    return {};
  }
}
function patchPay(sagaId: string, patch: Partial<StoredPay>): void {
  sessionStorage.setItem(payKey(sagaId), JSON.stringify({ ...loadPay(sagaId), ...patch }));
}

/* ── Drobne klocki UI ──────────────────────────────────────────────────── */

function Field({
  label,
  error,
  children,
  hint,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-neutral-700">{label}</span>
      {children}
      {hint}
      {error && <span className="mt-1 block text-xs font-medium text-red-600">{error}</span>}
    </label>
  );
}

const inputCls =
  "h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-emerald-900/10 bg-white p-4 shadow-[0_4px_16px_rgba(16,84,48,0.06)] sm:p-5">
      <h2 className="text-base font-bold text-neutral-900">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-neutral-500">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Progress({ current }: { current: 1 | 2 | 3 }) {
  const steps = ["Dane podróżnych", "Płatność: hotel", "Płatność: lot"];
  return (
    <ol className="mb-5 flex items-center gap-2" aria-label="Kroki rezerwacji">
      {steps.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3;
        const done = n < current;
        const active = n === current;
        return (
          <li key={label} className="flex min-w-0 flex-1 items-center gap-2">
            <span
              aria-hidden
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                done ? "bg-emerald-600 text-white" : active ? "border-2 border-emerald-600 bg-white text-emerald-700" : "border border-neutral-300 bg-white text-neutral-400"
              }`}
            >
              {done ? "✓" : n}
            </span>
            <span className={`truncate text-xs font-semibold ${active ? "text-neutral-900" : done ? "text-emerald-700" : "text-neutral-400"}`}>
              {label}
            </span>
            {n < 3 && <span aria-hidden className={`h-px flex-1 ${done ? "bg-emerald-400" : "bg-neutral-200"}`} />}
          </li>
        );
      })}
    </ol>
  );
}

function fmtRange(from: string, to: string): string {
  const fmt = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "short", timeZone: "UTC" });
  try {
    return `${fmt.format(new Date(`${from}T00:00:00Z`))} – ${fmt.format(new Date(`${to}T00:00:00Z`))}`;
  } catch {
    return `${from} – ${to}`;
  }
}

/** Rekap oferty — stały nagłówek wszystkich kroków (user zawsze wie, co kupuje). */
function OfferRecap({ offer }: { offer: CheckoutOfferParams }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-xl border border-emerald-900/10 bg-white/80 px-3 py-2 text-sm">
      <span className="font-semibold text-neutral-900">{offer.hotelName || offer.destination}</span>
      <span aria-hidden className="text-neutral-300">|</span>
      <span className="text-neutral-600">{offer.destination} · {fmtRange(offer.dateFrom, offer.dateTo)}</span>
      <span aria-hidden className="text-neutral-300">|</span>
      <span className="text-neutral-600">{offer.adults} os.</span>
      <span className="ml-auto whitespace-nowrap text-xs text-neutral-500">
        hotel {formatPLN(offer.hotelPln)} + lot {formatPLN(offer.flightPln)}
      </span>
    </div>
  );
}

/* ── Komponent główny ──────────────────────────────────────────────────── */

type Phase =
  | { kind: "form" }
  | { kind: "starting" }
  | { kind: "hotel"; sagaId: string; pay: NonNullable<StoredPay["hotel"]> }
  | { kind: "flight"; sagaId: string; pay: NonNullable<StoredPay["flight"]>; deadlineAt: string | null }
  // Wznowienie cross-device: hotel opłacony, sekret płatności lotu przepadł
  // z przeglądarką → ponowne wpisanie pasażerów + re-hold TEJ SAMEJ taryfy.
  | { kind: "rehold"; sagaId: string; deadlineAt: string | null }
  | { kind: "reholding"; sagaId: string; deadlineAt: string | null }
  | { kind: "cancelled"; sagaId: string }
  | { kind: "expired"; sagaId: string; message: string }
  | { kind: "fatal"; message: string };

export function PackageCheckout({
  offer,
  resume,
}: {
  offer: CheckoutOfferParams;
  resume: { sagaId: string | null; step: string | null };
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  const [contact, setContact] = useState<ContactForm>({ firstName: "", lastName: "", email: "", phoneNumber: "", phoneCountryCode: "48" });
  const [pax, setPax] = useState<PaxForm[]>(() => Array.from({ length: offer.adults }, emptyPax));
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [priceChange, setPriceChange] = useState<{ total: number | null } | null>(null);
  const acceptPriceRef = useRef(false);

  /* Wznowienie po redirectcie płatności (?saga=…&step=hotel|flight). */
  useEffect(() => {
    if (!resume.sagaId || !resume.step) return;
    const sagaId = resume.sagaId;
    const stored = loadPay(sagaId);
    if (resume.step === "hotel") {
      if (stored.hotel) setPhase({ kind: "hotel", sagaId, pay: stored.hotel });
      else setPhase({ kind: "expired", sagaId, message: "Sesja płatności za hotel wygasła. Nic nie zostało pobrane — zacznij rezerwację od nowa." });
      return;
    }
    if (resume.step === "flight") {
      void (async () => {
        try {
          const res = await fetch(`/api/pakiety/checkout/${encodeURIComponent(sagaId)}`);
          const state = (await res.json()) as { state?: string; deadlineAt?: string | null };
          if (state.state !== "HOTEL_BOOKED_AWAITING_FLIGHT" && state.state !== "FLIGHT_PAID") {
            setPhase({ kind: "expired", sagaId, message: "Ta rezerwacja nie czeka już na płatność za lot. Sprawdź e-mail albo stronę potwierdzenia." });
            return;
          }
          if (!stored.flight) {
            if (state.state === "HOTEL_BOOKED_AWAITING_FLIGHT") {
              // Inne urządzenie / wyczyszczona przeglądarka → wznowienie:
              // ponowne dane pasażerów + re-hold tej samej taryfy (backend
              // rehold-flight). Hotel jest bezpieczny (deadline sam zwróci).
              setPhase({ kind: "rehold", sagaId, deadlineAt: state.deadlineAt ?? null });
              return;
            }
            setPhase({
              kind: "expired",
              sagaId,
              message:
                "Ta płatność nie może być wznowiona w tej przeglądarce. Sprawdź status rezerwacji — jeśli nie została dokończona, anulujemy ją automatycznie i zwrócimy pełną kwotę za hotel.",
            });
            return;
          }
          setPhase({ kind: "flight", sagaId, pay: stored.flight, deadlineAt: state.deadlineAt ?? null });
        } catch {
          setPhase({ kind: "fatal", message: "Nie udało się wczytać stanu rezerwacji. Odśwież stronę." });
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // §7: start formularza (raz, tylko świeże wejście — nie wznowienia) i ekran
  // płatności z jawną listą metod (pomiar dropu — decyzje pkt 5, brak BLIK).
  useEffect(() => {
    if (!resume.sagaId) track("package_passenger_form_start", { destination: offer.destination, adults: offer.adults });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (phase.kind === "hotel" || phase.kind === "flight") {
      track("package_payment_method_shown", { which: phase.kind, destination: offer.destination });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.kind]);

  const setPaxField = (i: number, field: keyof PaxForm, value: string) => {
    setPax((prev) => prev.map((p, j) => (j === i ? { ...p, [field]: value } : p)));
  };

  const validate = useCallback((): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!contact.firstName.trim()) e["c.firstName"] = "Podaj imię";
    if (!contact.lastName.trim()) e["c.lastName"] = "Podaj nazwisko";
    if (!/^\S+@\S+\.\S+$/.test(contact.email)) e["c.email"] = "Podaj poprawny e-mail";
    if (!/^[0-9 \-()]{5,20}$/.test(contact.phoneNumber)) e["c.phoneNumber"] = "Podaj numer telefonu";
    pax.forEach((p, i) => {
      if (!NAME_RE.test(p.firstName)) e[`p${i}.firstName`] = "Litery A–Z (jak w dokumencie)";
      if (!NAME_RE.test(p.lastName)) e[`p${i}.lastName`] = "Litery A–Z (jak w dokumencie)";
      if (!p.birthday) e[`p${i}.birthday`] = "Podaj datę urodzenia";
      if (!p.gender) e[`p${i}.gender`] = "Wybierz";
      if (!/^[A-Za-z]{2}$/.test(p.nationality)) e[`p${i}.nationality`] = "Kod kraju (2 litery)";
      if (p.documentNumber.trim().length < 3) e[`p${i}.documentNumber`] = "Podaj numer dokumentu";
      if (!p.documentExpiry) e[`p${i}.documentExpiry`] = "Podaj datę ważności";
      else if (offer.dateTo && p.documentExpiry <= offer.dateTo) e[`p${i}.documentExpiry`] = "Dokument musi być ważny po dacie powrotu";
      if (!/^[A-Za-z]{2}$/.test(p.documentIssueCountry)) e[`p${i}.documentIssueCountry`] = "Kod kraju (2 litery)";
    });
    if (!terms) e["terms"] = "Wymagana akceptacja";
    return e;
  }, [contact, pax, terms, offer.dateTo]);

  /** Dane → start sagi → hold lotu → prebook hotelu → Checkout 1. */
  const submitForm = useCallback(async () => {
    const eMap = validate();
    setErrors(eMap);
    if (Object.keys(eMap).length) return;
    setSubmitError(null);
    setPhase({ kind: "starting" });
    track("package_passenger_form_complete", { destination: offer.destination, adults: offer.adults });

    try {
      // 1. Start sagi (intencja w Postgresie).
      const startRes = await fetch("/api/pakiety/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contact: {
            firstName: contact.firstName.trim(),
            lastName: contact.lastName.trim(),
            email: contact.email.trim(),
            phone: `+${contact.phoneCountryCode} ${contact.phoneNumber.trim()}`,
          },
          offer: {
            destination: offer.destination,
            hotelId: offer.hotelId,
            hotelName: offer.hotelName,
            rateId: offer.rateId,
            flightOfferId: offer.flightOfferId,
            dateFrom: offer.dateFrom,
            dateTo: offer.dateTo,
            adults: offer.adults,
            hotelPln: offer.hotelPln,
            flightPln: offer.flightPln,
          },
        }),
      });
      if (startRes.status === 503) {
        setPhase({ kind: "fatal", message: "Rezerwacje pakietów są chwilowo niedostępne. Spróbuj za kilka minut — nic nie zostało pobrane." });
        return;
      }
      if (!startRes.ok) throw new Error(`start ${startRes.status}`);
      const { sagaId } = (await startRes.json()) as { sagaId: string };

      // 2. HOLD lotu (verify + prebook; bez płatności).
      const holdRes = await fetch(`/api/pakiety/checkout/${encodeURIComponent(sagaId)}/hold-flight`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          offerId: offer.flightOfferId,
          lastTravelDate: offer.dateTo || undefined,
          acceptPriceChange: acceptPriceRef.current,
          contact: {
            firstName: contact.firstName.trim(),
            lastName: contact.lastName.trim(),
            email: contact.email.trim(),
            phoneNumber: contact.phoneNumber.trim(),
            phoneCountryCode: contact.phoneCountryCode,
          },
          passengers: pax.map((p) => ({
            firstName: translit(p.firstName.trim()),
            lastName: translit(p.lastName.trim()),
            birthday: p.birthday,
            gender: p.gender,
            nationality: p.nationality.toUpperCase(),
            type: "ADT",
            documentType: p.documentType,
            documentNumber: p.documentNumber.trim(),
            documentExpiry: p.documentExpiry,
            documentIssueCountry: p.documentIssueCountry.toUpperCase(),
          })),
        }),
      });
      if (holdRes.status === 409) {
        const body = (await holdRes.json()) as { priceChanged?: boolean; total?: number | null };
        if (body.priceChanged) {
          setPriceChange({ total: body.total ?? null });
          setPhase({ kind: "form" });
          return;
        }
        throw new Error("hold 409");
      }
      if (!holdRes.ok) throw new Error(`hold ${holdRes.status}`);
      const hold = (await holdRes.json()) as { secretKey: string; amount: number | null; currency: string; widgetEnv: "live" | "sandbox" };
      patchPay(sagaId, { flight: hold });

      // 3. Prebook hotelu → PaymentIntent A (Checkout 1).
      const preRes = await fetch(`/api/pakiety/checkout/${encodeURIComponent(sagaId)}/prebook-hotel`, { method: "POST" });
      if (!preRes.ok) throw new Error(`prebook-hotel ${preRes.status}`);
      const hotelPay = (await preRes.json()) as { secretKey: string; amount: number | null; currency: string; widgetEnv: "live" | "sandbox" };
      patchPay(sagaId, { hotel: hotelPay });

      track("package_payment_start", { destination: offer.destination, which: "hotel" });
      window.history.replaceState(null, "", `/pakiety/checkout?saga=${encodeURIComponent(sagaId)}&step=hotel`);
      setPhase({ kind: "hotel", sagaId, pay: hotelPay });
    } catch (err) {
      console.error("[pakiety/checkout] submit:", err);
      setSubmitError("Nie udało się rozpocząć rezerwacji. Nic nie zostało pobrane — spróbuj ponownie.");
      setPhase({ kind: "form" });
    }
  }, [contact, pax, offer, validate]);

  /**
   * Wznowienie (hotel opłacony, sekret lotu przepadł): ponowny hold TEJ SAMEJ
   * taryfy (offerId trzyma saga, nie request). Zmiana ceny → banner z wyborem
   * „Akceptuję / Anuluj wszystko" (spec §4).
   */
  const submitRehold = useCallback(
    async (sagaId: string, deadlineAt: string | null) => {
      const eMap = validate();
      setErrors(eMap);
      if (Object.keys(eMap).length) return;
      setSubmitError(null);
      setPhase({ kind: "reholding", sagaId, deadlineAt });

      try {
        const res = await fetch(`/api/pakiety/checkout/${encodeURIComponent(sagaId)}/rehold-flight`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            lastTravelDate: offer.dateTo || undefined,
            acceptPriceChange: acceptPriceRef.current,
            contact: {
              firstName: contact.firstName.trim(),
              lastName: contact.lastName.trim(),
              email: contact.email.trim(),
              phoneNumber: contact.phoneNumber.trim(),
              phoneCountryCode: contact.phoneCountryCode,
            },
            passengers: pax.map((p) => ({
              firstName: translit(p.firstName.trim()),
              lastName: translit(p.lastName.trim()),
              birthday: p.birthday,
              gender: p.gender,
              nationality: p.nationality.toUpperCase(),
              type: "ADT",
              documentType: p.documentType,
              documentNumber: p.documentNumber.trim(),
              documentExpiry: p.documentExpiry,
              documentIssueCountry: p.documentIssueCountry.toUpperCase(),
            })),
          }),
        });
        if (res.status === 409) {
          const body = (await res.json()) as { priceChanged?: boolean; total?: number | null; message?: string };
          if (body.priceChanged) {
            setPriceChange({ total: body.total ?? null });
            setPhase({ kind: "rehold", sagaId, deadlineAt });
            return;
          }
          setPhase({ kind: "expired", sagaId, message: body.message ?? "Rezerwacja nie czeka już na płatność za lot." });
          return;
        }
        if (res.status === 503) {
          setPhase({ kind: "fatal", message: "Rezerwacje pakietów są chwilowo niedostępne. Spróbuj za kilka minut — nic nie zostało pobrane." });
          return;
        }
        if (!res.ok) throw new Error(`rehold ${res.status}`);
        const hold = (await res.json()) as { secretKey: string; amount: number | null; currency: string; widgetEnv: "live" | "sandbox" };
        patchPay(sagaId, { flight: hold });
        track("package_payment_start", { destination: offer.destination, which: "flight" });
        setPhase({ kind: "flight", sagaId, pay: hold, deadlineAt });
      } catch (err) {
        console.error("[pakiety/checkout] rehold:", err);
        setSubmitError("Nie udało się wznowić rezerwacji lotu. Spróbuj ponownie — hotel jest bezpieczny.");
        setPhase({ kind: "rehold", sagaId, deadlineAt });
      }
    },
    [contact, pax, offer, validate],
  );

  /** „Anuluj wszystko — pełny zwrot za hotel" (kompensację robi saga). */
  const cancelAll = useCallback(async (sagaId: string, deadlineAt: string | null) => {
    setSubmitError(null);
    try {
      const res = await fetch(`/api/pakiety/checkout/${encodeURIComponent(sagaId)}/cancel`, { method: "POST" });
      if (!res.ok) throw new Error(`cancel ${res.status}`);
      setPhase({ kind: "cancelled", sagaId });
    } catch (err) {
      console.error("[pakiety/checkout] cancel:", err);
      setSubmitError("Nie udało się anulować. Spróbuj ponownie albo po prostu nie kończ płatności — po deadlinie anulujemy i zwrócimy automatycznie.");
      setPhase({ kind: "rehold", sagaId, deadlineAt });
    }
  }, []);

  /* ── Render per faza ──────────────────────────────────────────────── */

  if (phase.kind === "fatal") {
    return (
      <Shell offer={offer} step={1}>
        <Card title="Coś poszło nie tak">
          <p className="text-sm text-neutral-700">{phase.message}</p>
          <Link href="/pakiety/szukaj" className="mt-4 inline-flex h-10 items-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700">
            Wróć do wyników
          </Link>
        </Card>
      </Shell>
    );
  }

  if (phase.kind === "expired") {
    return (
      <Shell offer={offer} step={3}>
        <Card title="Nie można wznowić płatności">
          <p className="text-sm leading-6 text-neutral-700">{phase.message}</p>
          <p className="mt-2 text-xs text-neutral-500">Numer rezerwacji: {phase.sagaId}. Status znajdziesz też w e-mailu.</p>
          <Link href={`/pakiety/rezerwacja/${encodeURIComponent(phase.sagaId)}`} className="mt-4 inline-flex h-10 items-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700">
            Zobacz status rezerwacji
          </Link>
        </Card>
      </Shell>
    );
  }

  if (phase.kind === "cancelled") {
    return (
      <Shell offer={offer} step={3}>
        <Card title="Rezerwacja anulowana — pełny zwrot w drodze">
          <p className="text-sm leading-6 text-neutral-700">
            Zgodnie z Twoją decyzją anulowaliśmy hotel (miał bezpłatną anulację) i uruchomiliśmy pełny zwrot
            płatności. Na wyciągu zobaczysz go od NUITEE TRAVEL. Potwierdzenie wysłaliśmy e-mailem.
          </p>
          <p className="mt-2 text-xs text-neutral-500">Numer pakietu: {phase.sagaId}</p>
          <Link
            href={`/pakiety/rezerwacja/${encodeURIComponent(phase.sagaId)}`}
            className="mt-4 inline-flex h-10 items-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Zobacz status zwrotu
          </Link>
        </Card>
      </Shell>
    );
  }

  if (phase.kind === "hotel") {
    return (
      <Shell offer={offer} step={2}>
        <Card
          title="Płatność 1 z 2 — hotel"
          subtitle={`Za chwilę osobno opłacisz lot${phase.pay.amount !== null && offer.flightPln ? ` (${formatPLN(offer.flightPln)})` : ""}. Hotel ma bezpłatną anulację.`}
        >
          <div className="mb-3 flex items-baseline justify-between rounded-xl bg-emerald-50 px-3 py-2">
            <span className="text-sm font-semibold text-emerald-900">{offer.hotelName}</span>
            <span className="text-lg font-bold tabular-nums text-emerald-800">
              {phase.pay.amount !== null ? formatPLN(phase.pay.amount) : formatPLN(offer.hotelPln)}
            </span>
          </div>
          <PaymentSlot
            prebook={{
              secretKey: phase.pay.secretKey,
              sessionId: phase.sagaId,
              amount: phase.pay.amount ?? offer.hotelPln,
              currency: phase.pay.currency || "PLN",
              widgetEnv: phase.pay.widgetEnv,
            } satisfies PaymentSlotPrebook}
            returnBaseUrl={typeof window !== "undefined" ? window.location.origin : ""}
            returnPath="/pakiety/checkout/return/hotel"
            submitText={`Zapłać za hotel ${phase.pay.amount !== null ? formatPLN(phase.pay.amount) : formatPLN(offer.hotelPln)}`}
            onMountFail={() => setPhase({ kind: "fatal", message: "Nie udało się załadować formularza płatności. Odśwież stronę — nic nie zostało pobrane." })}
          />
          <p className="mt-3 text-[11px] leading-4 text-neutral-500">
            Na wyciągu zobaczysz NUITEE TRAVEL — operatora płatności helptravel.pl. Płacisz kartą, Apple Pay albo Google Pay.
          </p>
        </Card>
      </Shell>
    );
  }

  if (phase.kind === "flight") {
    return (
      <Shell offer={offer} step={3}>
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white">
          <span aria-hidden>✓</span> Hotel potwierdzony i opłacony — została płatność za lot
        </div>
        <Card title="Płatność 2 z 2 — lot" subtitle="Po tej płatności wystawiamy bilety i wysyłamy potwierdzenie z dwoma numerami rezerwacji.">
          {phase.deadlineAt && <DeadlineNote deadlineAt={phase.deadlineAt} />}
          <div className="mb-3 flex items-baseline justify-between rounded-xl bg-emerald-50 px-3 py-2">
            <span className="text-sm font-semibold text-emerald-900">Przelot w obie strony</span>
            <span className="text-lg font-bold tabular-nums text-emerald-800">
              {phase.pay.amount !== null ? formatPLN(phase.pay.amount) : formatPLN(offer.flightPln)}
            </span>
          </div>
          <PaymentSlot
            prebook={{
              secretKey: phase.pay.secretKey,
              sessionId: phase.sagaId,
              amount: phase.pay.amount ?? offer.flightPln,
              currency: phase.pay.currency || "PLN",
              widgetEnv: phase.pay.widgetEnv,
            } satisfies PaymentSlotPrebook}
            returnBaseUrl={typeof window !== "undefined" ? window.location.origin : ""}
            returnPath="/pakiety/checkout/return/flight"
            submitText={`Zapłać za lot ${phase.pay.amount !== null ? formatPLN(phase.pay.amount) : formatPLN(offer.flightPln)}`}
            onMountFail={() => setPhase({ kind: "expired", sagaId: phase.sagaId, message: "Nie udało się załadować formularza płatności za lot. Odśwież stronę." })}
          />
          <p className="mt-3 text-[11px] leading-4 text-neutral-500">
            Lot po zakupie jest bezzwrotny. Hotel: bezpłatna anulacja (szczegóły w potwierdzeniu). Na wyciągu: NUITEE TRAVEL.
            Bagaż zgodnie z taryfą z kroku wyboru lotu — dodatkowy dokupisz u przewoźnika po otrzymaniu potwierdzenia.
          </p>
        </Card>
      </Shell>
    );
  }

  /* Faza formularza (świeży start LUB wznowienie) + stany „w toku". */
  const reholdCtx = phase.kind === "rehold" || phase.kind === "reholding" ? phase : null;
  const busy = phase.kind === "starting" || phase.kind === "reholding";

  return (
    <Shell offer={offer} step={reholdCtx ? 3 : 1}>
      {reholdCtx && (
        <>
          <div className="mb-3 flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white">
            <span aria-hidden>✓</span> Hotel opłacony i potwierdzony — dokończ płatność za lot
          </div>
          {reholdCtx.deadlineAt && <DeadlineNote deadlineAt={reholdCtx.deadlineAt} />}
          <div className="mb-4 rounded-xl border border-emerald-900/10 bg-white px-3 py-2.5 text-xs leading-5 text-neutral-600">
            Wznawiasz rezerwację na nowym urządzeniu, więc poprosimy o dane pasażerów jeszcze raz — ze
            względów bezpieczeństwa nie przechowujemy numerów dokumentów. Taryfa lotu zostaje ta sama.
          </div>
        </>
      )}
      {priceChange && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">Cena lotu właśnie się zmieniła{priceChange.total !== null ? ` — aktualnie ${formatPLN(priceChange.total)}` : ""}.</p>
          <p className="mt-1 text-xs leading-5">
            Linie lotnicze zmieniają ceny w czasie rzeczywistym.{" "}
            {reholdCtx
              ? "Możesz kontynuować z nową ceną albo anulować całość z pełnym zwrotem za hotel."
              : "Możesz kontynuować z nową ceną albo wrócić do wyników."}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                acceptPriceRef.current = true;
                setPriceChange(null);
                if (reholdCtx) void submitRehold(reholdCtx.sagaId, reholdCtx.deadlineAt);
                else void submitForm();
              }}
              className="h-9 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-700"
            >
              Kontynuuję z nową ceną
            </button>
            {reholdCtx ? (
              <button
                type="button"
                onClick={() => void cancelAll(reholdCtx.sagaId, reholdCtx.deadlineAt)}
                className="inline-flex h-9 items-center rounded-lg border border-amber-300 bg-white px-3 text-xs font-semibold text-amber-900 hover:bg-amber-100"
              >
                Anuluj wszystko (pełny zwrot za hotel)
              </button>
            ) : (
              <Link href="/pakiety/szukaj" className="inline-flex h-9 items-center rounded-lg border border-amber-300 bg-white px-3 text-xs font-semibold text-amber-900">
                Wróć do wyników
              </Link>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4">
        <Card title="Dane kontaktowe" subtitle="Tu wyślemy oba potwierdzenia (hotel + lot).">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Imię" error={errors["c.firstName"]}>
              <input className={inputCls} value={contact.firstName} onChange={(e) => setContact({ ...contact, firstName: e.target.value })} autoComplete="given-name" />
            </Field>
            <Field label="Nazwisko" error={errors["c.lastName"]}>
              <input className={inputCls} value={contact.lastName} onChange={(e) => setContact({ ...contact, lastName: e.target.value })} autoComplete="family-name" />
            </Field>
            <Field label="E-mail" error={errors["c.email"]}>
              <input className={inputCls} type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} autoComplete="email" />
            </Field>
            <Field label="Telefon" error={errors["c.phoneNumber"]}>
              <div className="flex gap-2">
                <span className="inline-flex h-10 items-center rounded-lg border border-neutral-300 bg-neutral-50 px-2.5 text-sm text-neutral-600">+{contact.phoneCountryCode}</span>
                <input className={inputCls} inputMode="tel" value={contact.phoneNumber} onChange={(e) => setContact({ ...contact, phoneNumber: e.target.value })} autoComplete="tel-national" />
              </div>
            </Field>
          </div>
        </Card>

        {pax.map((p, i) => (
          <Card key={i} title={`Pasażer ${i + 1} (dorosły)`} subtitle="Dane muszą być identyczne jak w dowodzie lub paszporcie.">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field
                label="Imię (jak w dokumencie)"
                error={errors[`p${i}.firstName`]}
                hint={
                  p.firstName && !NAME_RE.test(p.firstName) && NAME_RE.test(translit(p.firstName)) ? (
                    <button type="button" onClick={() => setPaxField(i, "firstName", translit(p.firstName))} className="mt-1 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                      Zamień: {p.firstName} → {translit(p.firstName).toUpperCase()}
                    </button>
                  ) : undefined
                }
              >
                <input className={inputCls} value={p.firstName} onChange={(e) => setPaxField(i, "firstName", e.target.value)} />
              </Field>
              <Field
                label="Nazwisko (jak w dokumencie)"
                error={errors[`p${i}.lastName`]}
                hint={
                  p.lastName && !NAME_RE.test(p.lastName) && NAME_RE.test(translit(p.lastName)) ? (
                    <button type="button" onClick={() => setPaxField(i, "lastName", translit(p.lastName))} className="mt-1 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                      Zamień: {p.lastName} → {translit(p.lastName).toUpperCase()}
                    </button>
                  ) : undefined
                }
              >
                <input className={inputCls} value={p.lastName} onChange={(e) => setPaxField(i, "lastName", e.target.value)} />
              </Field>
              <Field label="Data urodzenia" error={errors[`p${i}.birthday`]}>
                <input className={inputCls} type="date" value={p.birthday} onChange={(e) => setPaxField(i, "birthday", e.target.value)} max={new Date().toISOString().slice(0, 10)} />
              </Field>
              <Field label="Płeć (jak w dokumencie)" error={errors[`p${i}.gender`]}>
                <select className={inputCls} value={p.gender} onChange={(e) => setPaxField(i, "gender", e.target.value)}>
                  <option value="">Wybierz…</option>
                  <option value="M">Mężczyzna</option>
                  <option value="F">Kobieta</option>
                </select>
              </Field>
              <Field label="Dokument" error={errors[`p${i}.documentType`]}>
                <select className={inputCls} value={p.documentType} onChange={(e) => setPaxField(i, "documentType", e.target.value)}>
                  <option value="passport">Paszport</option>
                  <option value="id">Dowód osobisty</option>
                </select>
              </Field>
              <Field label="Numer dokumentu" error={errors[`p${i}.documentNumber`]}>
                <input className={inputCls} value={p.documentNumber} onChange={(e) => setPaxField(i, "documentNumber", e.target.value)} />
              </Field>
              <Field label="Ważny do" error={errors[`p${i}.documentExpiry`]}>
                <input className={inputCls} type="date" value={p.documentExpiry} onChange={(e) => setPaxField(i, "documentExpiry", e.target.value)} min={offer.dateTo || undefined} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Obywatelstwo" error={errors[`p${i}.nationality`]}>
                  <input className={inputCls} value={p.nationality} maxLength={2} onChange={(e) => setPaxField(i, "nationality", e.target.value.toUpperCase())} />
                </Field>
                <Field label="Kraj wydania" error={errors[`p${i}.documentIssueCountry`]}>
                  <input className={inputCls} value={p.documentIssueCountry} maxLength={2} onChange={(e) => setPaxField(i, "documentIssueCountry", e.target.value.toUpperCase())} />
                </Field>
              </div>
            </div>
          </Card>
        ))}

        <Card
          title={reholdCtx ? "Dokończenie rezerwacji lotu" : "Płatność w dwóch krokach"}
          subtitle={
            reholdCtx
              ? "Hotel jest już opłacony. Została jedna płatność — za lot."
              : "Tak działa pakiet — i dzięki temu nigdy nie płacisz za lot przed potwierdzeniem hotelu."
          }
        >
          {reholdCtx ? (
            <p className="text-sm leading-6 text-neutral-700">
              Potwierdzimy aktualną cenę taryfy i przygotujemy płatność. Jeśli cena się zmieniła, zobaczysz
              ją jawnie i zdecydujesz — możesz też anulować całość z pełnym zwrotem za hotel.
            </p>
          ) : (
            <ol className="space-y-1.5 text-sm text-neutral-700">
              <li><span className="font-semibold text-emerald-700">1.</span> Płacisz za hotel ({formatPLN(offer.hotelPln)}) — z bezpłatną anulacją.</li>
              <li><span className="font-semibold text-emerald-700">2.</span> Od razu po potwierdzeniu hotelu płacisz za lot ({formatPLN(offer.flightPln)}).</li>
            </ol>
          )}
          <p className="mt-2 text-[11px] leading-4 text-neutral-500">
            Dwie transakcje, dwa potwierdzenia. Na wyciągu obie jako NUITEE TRAVEL — operator płatności helptravel.pl.
            Karta, Apple Pay lub Google Pay (BLIK niedostępny).
          </p>
          <label className="mt-3 flex items-start gap-2.5 text-sm text-neutral-700">
            <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 h-4 w-4 accent-emerald-600" />
            <span>
              Akceptuję <Link href="/regulamin" target="_blank" className="font-semibold text-emerald-700 underline decoration-emerald-300 underline-offset-2">regulamin</Link>{" "}
              i przyjmuję do wiadomości, że rezerwuję dwie powiązane usługi turystyczne (hotel + lot).
              {errors["terms"] && <span className="block text-xs font-medium text-red-600">{errors["terms"]}</span>}
            </span>
          </label>

          {submitError && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{submitError}</p>}

          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (reholdCtx) void submitRehold(reholdCtx.sagaId, reholdCtx.deadlineAt);
              else void submitForm();
            }}
            className="mt-4 h-11 w-full rounded-xl bg-emerald-600 text-sm font-bold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy
              ? reholdCtx
                ? "Wznawiamy rezerwację lotu…"
                : "Rezerwujemy lot i hotel…"
              : reholdCtx
                ? "Dalej: płatność za lot"
                : "Dalej: płatność za hotel"}
          </button>
          {reholdCtx && !busy && (
            <button
              type="button"
              onClick={() => void cancelAll(reholdCtx.sagaId, reholdCtx.deadlineAt)}
              className="mt-2 h-9 w-full rounded-lg text-xs font-semibold text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
            >
              Anuluj wszystko — pełny zwrot za hotel
            </button>
          )}
          <p className="mt-2 text-center text-[11px] text-neutral-500">Ten krok jeszcze niczego nie pobiera z karty.</p>
        </Card>
      </div>
    </Shell>
  );
}

function Shell({ offer, step, children }: { offer: CheckoutOfferParams; step: 1 | 2 | 3; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-8">
      <h1 className="mb-3 text-xl font-bold tracking-tight text-neutral-900 sm:text-2xl">Rezerwacja pakietu Lot + Hotel</h1>
      <OfferRecap offer={offer} />
      <Progress current={step} />
      {children}
    </div>
  );
}

function DeadlineNote({ deadlineAt }: { deadlineAt: string }) {
  const [left, setLeft] = useState(() => Math.max(0, new Date(deadlineAt).getTime() - Date.now()));
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, new Date(deadlineAt).getTime() - Date.now())), 1000);
    return () => clearInterval(t);
  }, [deadlineAt]);
  const mm = Math.floor(left / 60000);
  const ss = Math.floor((left % 60000) / 1000);
  return (
    <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
      Dokończ płatność w ciągu{" "}
      <span className="font-bold tabular-nums">{mm}:{String(ss).padStart(2, "0")}</span> — po tym czasie automatycznie
      anulujemy hotel i zwrócimy pełną kwotę.
    </p>
  );
}
