"use client";

// /loty/pasazerowie — dane pasażerów + kontakt (Faza 3.3). Wzór: checkout
// Booking/Airbnb stosowany na stronach hotelowych — jedna kolumna, sticky
// podsumowanie ceny, walidacja inline, pola dokumentu z wyjaśnieniem.
//
// Kontekst (wybrana oferta) czytamy z sessionStorage (FlightFlow). Submit →
// /api/flights/prebook → zapis sessionId/secretKey/widgetEnv → /loty/platnosc.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { track } from "@/lib/analytics/track";
import { fmtMoneyPln } from "@/lib/flights/display";
import { loadFlightFlow, patchFlightFlow, type FlightFlow } from "@/lib/flights/flow-storage";

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

export default function PassengersPage() {
  const router = useRouter();
  const [flow, setFlow] = useState<FlightFlow | null>(null);
  const [pax, setPax] = useState<PaxForm[]>([]);
  const [contact, setContact] = useState<ContactForm>({ firstName: "", lastName: "", email: "", phoneNumber: "", phoneCountryCode: "48" });
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

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

  function validate(): boolean {
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
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!flow) return;
    if (!validate()) {
      // Przewiń do pierwszego błędu.
      const firstKey = Object.keys(errors)[0];
      if (firstKey) document.getElementById(`field-${firstKey}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/flights/prebook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offerId: flow.offerId,
          lastTravelDate,
          contact: {
            firstName: contact.firstName.trim(),
            lastName: contact.lastName.trim(),
            email: contact.email.trim(),
            phoneNumber: contact.phoneNumber.replace(/[^\d]/g, ""),
            phoneCountryCode: contact.phoneCountryCode.replace(/\D/g, "") || "48",
          },
          passengers: pax.map((p) => ({
            title: p.gender === "F" ? "MRS" : "MR",
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
        if (json.error === "OFFER_UNAVAILABLE") {
          setSubmitError("Ta oferta wygasła. Wróć do wyników i wybierz lot ponownie.");
        } else {
          setSubmitError(json.message || "Nie udało się przygotować rezerwacji. Spróbuj ponownie.");
        }
        return;
      }
      track("flight_prebook", { offer_id: flow.offerId, price: json.price, currency: json.currency });
      // verifiedTotal := cena z prebooka (autorytatywna, tę kwotę pobierze
      // PaymentIntent). verifiedAt odświeżamy, by odzwierciedlał moment locka.
      patchFlightFlow({ sessionId: json.sessionId, secretKey: json.secretKey, widgetEnv: json.widgetEnv, verifiedTotal: json.price ?? flow.verifiedTotal, verifiedCurrency: json.currency ?? flow.verifiedCurrency, verifiedAt: Date.now() });
      router.push("/loty/platnosc");
    } catch {
      setSubmitError("Problem z połączeniem. Spróbuj ponownie.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!flow) {
    return <main className="mx-auto max-w-3xl px-4 py-12 text-sm text-neutral-500">Wczytywanie…</main>;
  }

  const total = flow.verifiedTotal;
  const inputCls = "h-11 w-full rounded-lg border border-neutral-300 px-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";
  const errCls = "mt-1 text-xs font-medium text-red-600";

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-bold text-neutral-900">Dane pasażerów</h1>
      <p className="mt-1 text-sm text-neutral-600">
        {flow.origin} → {flow.destination} · {flow.adults + flow.children + flow.infants} pasażerów
      </p>

      <form onSubmit={handleSubmit} className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {pax.map((p, i) => (
            <fieldset key={i} className="rounded-2xl border border-neutral-200 bg-white p-5">
              <legend className="px-1 text-sm font-bold text-neutral-900">
                Pasażer {i + 1} · {PAX_LABEL[p.type]}
              </legend>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div id={`field-p${i}.firstName`}>
                  <label className="text-xs font-medium text-neutral-600">Imię (jak w dokumencie)</label>
                  <input className={inputCls} value={p.firstName} onChange={(e) => setPaxField(i, "firstName", e.target.value)} />
                  {errors[`p${i}.firstName`] && <p className={errCls}>{errors[`p${i}.firstName`]}</p>}
                </div>
                <div id={`field-p${i}.lastName`}>
                  <label className="text-xs font-medium text-neutral-600">Nazwisko</label>
                  <input className={inputCls} value={p.lastName} onChange={(e) => setPaxField(i, "lastName", e.target.value)} />
                  {errors[`p${i}.lastName`] && <p className={errCls}>{errors[`p${i}.lastName`]}</p>}
                </div>
                <div id={`field-p${i}.birthday`}>
                  <label className="text-xs font-medium text-neutral-600">Data urodzenia</label>
                  <input type="date" className={inputCls} value={p.birthday} onChange={(e) => setPaxField(i, "birthday", e.target.value)} />
                  {errors[`p${i}.birthday`] && <p className={errCls}>{errors[`p${i}.birthday`]}</p>}
                </div>
                <div id={`field-p${i}.gender`}>
                  <label className="text-xs font-medium text-neutral-600">Płeć</label>
                  <select className={inputCls} value={p.gender} onChange={(e) => setPaxField(i, "gender", e.target.value)}>
                    <option value="">—</option>
                    <option value="M">Mężczyzna</option>
                    <option value="F">Kobieta</option>
                    <option value="X">Inna</option>
                  </select>
                  {errors[`p${i}.gender`] && <p className={errCls}>{errors[`p${i}.gender`]}</p>}
                </div>
                <div id={`field-p${i}.nationality`}>
                  <label className="text-xs font-medium text-neutral-600">Obywatelstwo (kod, np. PL)</label>
                  <input className={inputCls} maxLength={2} value={p.nationality} onChange={(e) => setPaxField(i, "nationality", e.target.value.toUpperCase())} />
                  {errors[`p${i}.nationality`] && <p className={errCls}>{errors[`p${i}.nationality`]}</p>}
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-600">Dokument</label>
                  <select className={inputCls} value={p.documentType} onChange={(e) => setPaxField(i, "documentType", e.target.value)}>
                    <option value="passport">Paszport</option>
                    <option value="id">Dowód osobisty</option>
                  </select>
                </div>
                <div id={`field-p${i}.documentNumber`}>
                  <label className="text-xs font-medium text-neutral-600">Numer dokumentu</label>
                  <input className={inputCls} value={p.documentNumber} onChange={(e) => setPaxField(i, "documentNumber", e.target.value.toUpperCase())} />
                  {errors[`p${i}.documentNumber`] && <p className={errCls}>{errors[`p${i}.documentNumber`]}</p>}
                </div>
                <div id={`field-p${i}.documentExpiry`}>
                  <label className="text-xs font-medium text-neutral-600">Ważny do</label>
                  <input type="date" className={inputCls} value={p.documentExpiry} onChange={(e) => setPaxField(i, "documentExpiry", e.target.value)} />
                  {errors[`p${i}.documentExpiry`] && <p className={errCls}>{errors[`p${i}.documentExpiry`]}</p>}
                </div>
              </div>
            </fieldset>
          ))}

          {/* Kontakt */}
          <fieldset className="rounded-2xl border border-neutral-200 bg-white p-5">
            <legend className="px-1 text-sm font-bold text-neutral-900">Dane kontaktowe</legend>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div id="field-c.firstName">
                <label className="text-xs font-medium text-neutral-600">Imię</label>
                <input className={inputCls} value={contact.firstName} onChange={(e) => setContact({ ...contact, firstName: e.target.value })} />
                {errors["c.firstName"] && <p className={errCls}>{errors["c.firstName"]}</p>}
              </div>
              <div id="field-c.lastName">
                <label className="text-xs font-medium text-neutral-600">Nazwisko</label>
                <input className={inputCls} value={contact.lastName} onChange={(e) => setContact({ ...contact, lastName: e.target.value })} />
                {errors["c.lastName"] && <p className={errCls}>{errors["c.lastName"]}</p>}
              </div>
              <div id="field-c.email">
                <label className="text-xs font-medium text-neutral-600">E-mail (tu wyślemy potwierdzenie)</label>
                <input type="email" className={inputCls} value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
                {errors["c.email"] && <p className={errCls}>{errors["c.email"]}</p>}
              </div>
              <div id="field-c.phoneNumber">
                <label className="text-xs font-medium text-neutral-600">Telefon</label>
                <div className="flex gap-2">
                  <input className={`${inputCls} w-16`} value={contact.phoneCountryCode} onChange={(e) => setContact({ ...contact, phoneCountryCode: e.target.value })} aria-label="Kod kraju" />
                  <input className={inputCls} value={contact.phoneNumber} onChange={(e) => setContact({ ...contact, phoneNumber: e.target.value })} />
                </div>
                {errors["c.phoneNumber"] && <p className={errCls}>{errors["c.phoneNumber"]}</p>}
              </div>
            </div>
          </fieldset>
        </div>

        {/* Sticky podsumowanie + CTA */}
        <aside className="lg:sticky lg:top-6 lg:h-fit">
          <div className="rounded-2xl border border-neutral-200 bg-white p-5">
            <h2 className="text-sm font-bold text-neutral-900">Podsumowanie</h2>
            <div className="mt-3 space-y-1 text-sm text-neutral-600">
              <div className="flex justify-between"><span>Trasa</span><span className="font-medium text-neutral-900">{flow.origin} → {flow.destination}</span></div>
              <div className="flex justify-between"><span>Pasażerowie</span><span className="font-medium text-neutral-900">{flow.adults + flow.children + flow.infants}</span></div>
            </div>
            <div className="mt-3 flex items-baseline justify-between border-t border-neutral-100 pt-3">
              <span className="text-sm font-semibold text-neutral-700">Razem</span>
              <span className="text-xl font-bold text-emerald-700">{fmtMoneyPln(total, flow.verifiedCurrency)}</span>
            </div>
            <p className="mt-1 text-[11px] text-neutral-500">Cena za wszystkich pasażerów, wł. podatków i opłat.</p>

            <label id="field-terms" className="mt-4 flex cursor-pointer items-start gap-2 text-xs text-neutral-700">
              <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500" />
              <span>
                Akceptuję <Link href="/regulamin" className="text-emerald-700 underline" target="_blank">Regulamin</Link> i{" "}
                <Link href="/polityka-prywatnosci" className="text-emerald-700 underline" target="_blank">Politykę prywatności</Link>.
              </span>
            </label>
            {errors["terms"] && <p className={errCls}>{errors["terms"]}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-xl bg-emerald-600 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {submitting ? "Przygotowuję płatność…" : "Przejdź do płatności →"}
            </button>
            <p className="mt-2 text-center text-[11px] text-neutral-500">Cena i dostępność lotu zostaną potwierdzone przed przejściem do płatności.</p>
            {submitError && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{submitError}</p>}
          </div>
        </aside>
      </form>
    </main>
  );
}
