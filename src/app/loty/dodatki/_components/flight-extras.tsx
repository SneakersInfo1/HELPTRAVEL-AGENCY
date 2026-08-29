"use client";

// Krok „Bagaż i taryfa". Pokazuje taryfy wybranej trasy (offer.fares) z bagażem
// i ceną; wybór → verify(offerId) → /loty/pasazerowie. Tu też mieszka obsługa
// zmiany ceny i wygaśnięcia oferty.
//
// ── ZMIANY Flights V2 (2026-08-29) ───────────────────────────────────────────
//
// UKŁAD. Było `max-w-2xl` w ramie `max-w-7xl` → treść 672 px na monitorze
// 1920 px, 65 % ekranu białe (pomiar Playwright). Teraz dwie kolumny: lot po
// lewej (sticky), taryfy po prawej — na mobile jedna kolumna, jak dotąd.
//
// RÓŻNICE MIĘDZY TARYFAMI. Brief §15: „jeżeli trzy taryfy praktycznie niczym
// się nie różnią, nie pokazuj ich jako trzech wielkich identycznych paneli".
// Wiersz taryfy pokazuje teraz to, co RÓŻNI: bagaż jako ikony i dopłatę
// względem najtańszej. Taryfy o identycznym profilu bagażu i cenie są zwijane
// do jednej pozycji, bo cztery identyczne panele to nie wybór, tylko szum.
//
// CENA. `formatFlightPriceExact` — na tym kroku kwota przestaje być
// orientacyjna, a `maximumFractionDigits: 0` pokazywało „1918 zł" przy realnych
// 1918,34 zł.
//
// CTA. Na mobile przycisk był poza pierwszym ekranem (375/390/412) — teraz
// sticky pasek z kwotą.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Briefcase, Check, Luggage, Minus } from "lucide-react";

import { track } from "@/lib/analytics/track";
import { type DisplayOffer, type FareOption } from "@/lib/flights/display";
import { averagePerTraveller, formatFlightPrice, formatFlightPriceExact } from "@/lib/flights/money";
import { FLIGHT_SHELL_FARE } from "@/lib/flights/layout";
import { loadFlightFlow, patchFlightFlow, flowTravellers, type FlightFlow } from "@/lib/flights/flow-storage";
import { buildResultsUrl } from "@/lib/flights/recovery";
import { findMatchingFare, findMatchingOffer } from "@/lib/flights/offer-match";
import { FlightItinerarySummary } from "@/components/flights/flight-itinerary-summary";
import { FlightPriceChangeDialog } from "@/components/flights/flight-price-change-dialog";
import { FlightStepNav } from "@/components/flights/flight-step-nav";
import { FLIGHT_STICKY_CTA_PAD, FlightStickyCta } from "@/components/flights/flight-sticky-cta";

/** Jedna cecha taryfy: jest / nie ma. Ikona niesie „co to jest", znak — „czy jest". */
function BagLine({ ok, label, icon: Icon }: { ok: boolean; label: string; icon: typeof Briefcase }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${ok ? "text-ink" : "text-ink-muted"}`}>
      {ok ? (
        <Check aria-hidden className="h-3.5 w-3.5 text-brand" strokeWidth={3} />
      ) : (
        <Minus aria-hidden className="h-3.5 w-3.5" strokeWidth={2.5} />
      )}
      <Icon aria-hidden className="h-3.5 w-3.5" strokeWidth={2} />
      <span className={ok ? "font-medium" : ""}>{label}</span>
      <span className="sr-only">{ok ? " — w cenie" : " — niedostępny w tej taryfie"}</span>
    </span>
  );
}

/**
 * Zwija taryfy nieodróżnialne dla użytkownika.
 *
 * Dostawca potrafi oddać kilka „branded fares" o tej samej cenie i tym samym
 * profilu bagażu (różnią się np. warunkami zmiany, których i tak nie mamy
 * z czego pokazać). Wyświetlanie ich jako osobnych wyborów zmusza człowieka do
 * decyzji, w której nie ma żadnej informacji. Zostawiamy pierwszą z grupy.
 */
function dedupeFares(fares: FareOption[]): FareOption[] {
  const seen = new Set<string>();
  const out: FareOption[] = [];
  for (const f of fares) {
    const key = `${f.total ?? "x"}|${f.hasCarryOnBag}|${f.hasCheckedBag}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

export function FlightExtras() {
  const router = useRouter();
  const [flow, setFlow] = useState<FlightFlow | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [verifying, setVerifying] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priceChange, setPriceChange] = useState<{ oldTotal: number; newTotal: number; currency: string; fare: FareOption } | null>(null);

  useEffect(() => {
    const f = loadFlightFlow();
    if (!f || !f.offer) {
      router.replace("/?tab=loty");
      return;
    }
    setFlow(f);
    setSelectedId(f.offerId || f.offer.fares[0]?.offerId || "");
  }, [router]);

  const fares = useMemo(() => (flow ? dedupeFares(flow.offer.fares) : []), [flow]);

  if (!flow) {
    return <main className={`${FLIGHT_SHELL_FARE} py-12 text-sm text-ink-muted`}>Wczytywanie…</main>;
  }

  const travellers = flowTravellers(flow);
  const cheapest = fares[0]?.total ?? null;
  const selected = fares.find((f) => f.offerId === selectedId) ?? fares[0];
  const selectedAvg = averagePerTraveller(selected?.total ?? null, travellers);

  function commit(fare: FareOption, total: number | null, currency: string) {
    patchFlightFlow({
      offerId: fare.offerId,
      selectedTotal: total,
      selectedCurrency: currency,
      verifiedAt: Date.now(),
      verified: true,
      fare: { name: fare.fareName, hasCarryOnBag: fare.hasCarryOnBag, hasCheckedBag: fare.hasCheckedBag },
    });
    track("fare_selected", {
      offer_id: fare.offerId,
      fare_name: fare.fareName,
      price: total ?? undefined,
      currency,
      has_checked_bag: fare.hasCheckedBag,
      has_carry_on_bag: fare.hasCarryOnBag,
    });
    router.push("/loty/pasazerowie");
  }

  // Woła /api/flights/verify dla danej taryfy; zwraca {ok, json}.
  async function callVerify(fare: FareOption): Promise<{ ok: boolean; json: Record<string, unknown> }> {
    const res = await fetch("/api/flights/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offerId: fare.offerId, previousTotal: fare.total ?? undefined, previousCurrency: fare.currency }),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, json };
  }

  // Płynne odzyskiwanie po wygaśnięciu oferty (52099 → OFFER_UNAVAILABLE): fresh
  // re-search TEJ SAMEJ trasy → dopasuj DOKŁADNIE ten sam lot (podpis segmentów)
  // + tę samą taryfę → re-verify świeży offerId. null = lotu już nie ma albo
  // świeży też się nie potwierdził → UI spada do ręcznego „wróć do wyników".
  // Zero cichej podmiany na inny/droższy lot; zmiana ceny idzie przez modal.
  async function recoverExpiredOffer(
    f: FlightFlow,
    prevFare: FareOption,
  ): Promise<
    | { fare: FareOption; matchOffer: DisplayOffer; total: number | null; currency: string; priceChanged: boolean; oldTotal?: number; newTotal?: number }
    | null
  > {
    const legs: Array<{ origin: string; destination: string; date: string; direction: "OUTBOUND" | "INBOUND" }> = [
      { origin: f.origin, destination: f.destination, date: f.depart, direction: "OUTBOUND" },
    ];
    if (f.ret) legs.push({ origin: f.destination, destination: f.origin, date: f.ret, direction: "INBOUND" });
    let freshOffers: DisplayOffer[] = [];
    try {
      const res = await fetch("/api/flights/rates?fresh=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ legs, adults: f.adults, children: f.children, infants: f.infants, cabinClass: "ECONOMY" }),
      });
      if (!res.ok) return null;
      const json = (await res.json().catch(() => ({}))) as { offers?: DisplayOffer[] };
      freshOffers = json.offers ?? [];
    } catch {
      return null;
    }
    const matchOffer = findMatchingOffer(freshOffers, f.offer);
    if (!matchOffer) return null;
    const freshFare = findMatchingFare(matchOffer, {
      name: f.fare?.name ?? prevFare.fareName,
      hasCarryOnBag: prevFare.hasCarryOnBag,
      hasCheckedBag: prevFare.hasCheckedBag,
    });
    if (!freshFare) return null;
    const { ok, json } = await callVerify(freshFare);
    if (!ok) return null; // świeży też nie da się potwierdzić → ręczne odzyskiwanie
    const newTotal = typeof json.newTotal === "number" ? json.newTotal : undefined;
    return {
      fare: freshFare,
      matchOffer,
      total: typeof json.total === "number" ? json.total : freshFare.total,
      currency: typeof json.currency === "string" ? json.currency : freshFare.currency,
      priceChanged: Boolean(json.priceChanged) && typeof newTotal === "number",
      oldTotal: typeof json.oldTotal === "number" ? json.oldTotal : prevFare.total ?? undefined,
      newTotal,
    };
  }

  async function proceed() {
    if (!flow || !selected || verifying) return;
    setVerifying(true);
    setError(null);
    try {
      const { ok, json } = await callVerify(selected);
      if (ok) {
        if (json.priceChanged && typeof json.newTotal === "number") {
          track("flight_verify_price_change", { offer_id: selected.offerId, old_price: json.oldTotal as number | undefined, new_price: json.newTotal, currency: json.currency as string | undefined });
          setPriceChange({ oldTotal: (json.oldTotal as number) ?? selected.total ?? 0, newTotal: json.newTotal, currency: (json.currency as string) ?? selected.currency, fare: selected });
          return;
        }
        commit(selected, (json.total as number) ?? selected.total, (json.currency as string) ?? selected.currency);
        return;
      }
      // Tylko wygasłą ofertę odzyskujemy automatycznie; inne błędy → komunikat.
      if (json.error !== "OFFER_UNAVAILABLE") {
        setError((json.message as string) || "Nie udało się potwierdzić oferty. Spróbuj ponownie.");
        return;
      }
      track("flight_offer_recovery", { offer_id: selected.offerId, outcome: "started" });
      setRecovering(true);
      const rec = await recoverExpiredOffer(flow, selected);
      if (!rec) {
        track("flight_offer_recovery", { offer_id: selected.offerId, outcome: "failed" });
        setError("Ta oferta wygasła i nie znaleźliśmy jej w świeżych wynikach. Wróć do wyników i wybierz lot ponownie.");
        return;
      }
      track("flight_offer_recovery", { offer_id: rec.fare.offerId, outcome: "recovered" });
      // Zapisz świeży, dopasowany lot (płatność użyje jego offerId, nie wygasłego).
      patchFlightFlow({ offer: rec.matchOffer });
      if (rec.priceChanged && typeof rec.newTotal === "number") {
        track("flight_verify_price_change", { offer_id: rec.fare.offerId, old_price: rec.oldTotal, new_price: rec.newTotal, currency: rec.currency });
        setPriceChange({ oldTotal: rec.oldTotal ?? selected.total ?? 0, newTotal: rec.newTotal, currency: rec.currency, fare: rec.fare });
        return;
      }
      commit(rec.fare, rec.total, rec.currency);
    } catch {
      setError("Problem z połączeniem. Spróbuj ponownie.");
    } finally {
      setVerifying(false);
      setRecovering(false);
    }
  }

  const ctaLabel = verifying ? (recovering ? "Odświeżam ofertę…" : "Sprawdzam cenę…") : "Dalej do danych";

  return (
    <main className={`${FLIGHT_SHELL_FARE} py-6 sm:py-8 ${FLIGHT_STICKY_CTA_PAD}`}>
      <FlightStepNav current="taryfa" className="mb-4" />

      <h1 className="text-2xl font-bold text-ink sm:text-3xl">Bagaż i taryfa</h1>
      <p className="mt-1 text-sm text-ink-muted">
        {flow.origin} → {flow.destination} · {travellers} {travellers === 1 ? "podróżny" : "podróżnych"}
      </p>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* ── Kolumna wyboru ── */}
        <div className="order-2 lg:order-1">
          <h2 className="text-sm font-bold text-ink">
            {fares.length > 1 ? "Wybierz taryfę z bagażem" : "Taryfa"}
          </h2>
          <div className="mt-2.5 space-y-2.5">
            {fares.map((fare) => {
              const active = fare.offerId === selectedId;
              const diff = cheapest !== null && fare.total !== null ? fare.total - cheapest : 0;
              const avg = averagePerTraveller(fare.total, travellers);
              return (
                <label
                  key={fare.offerId}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 ${
                    active
                      ? "border-brand bg-brand-soft/50 ring-1 ring-brand"
                      : "border-line bg-surface-raised hover:border-brand/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="fare"
                    checked={active}
                    onChange={() => setSelectedId(fare.offerId)}
                    className="h-4 w-4 shrink-0 border-line text-brand focus:ring-brand"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-ink">{fare.fareName}</p>
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                      <BagLine ok={fare.hasCarryOnBag} label="Bagaż podręczny" icon={Briefcase} />
                      <BagLine ok={fare.hasCheckedBag} label="Bagaż rejestrowany" icon={Luggage} />
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-base font-bold text-accent">{formatFlightPriceExact(fare.total, fare.currency)}</p>
                    {travellers > 1 && avg !== null && (
                      <p className="text-xs text-ink-muted">śr. {formatFlightPrice(avg, fare.currency)}/os.</p>
                    )}
                    {diff > 0 && (
                      <p className="text-xs font-medium text-ink-muted">+{formatFlightPriceExact(diff, fare.currency)}</p>
                    )}
                  </div>
                </label>
              );
            })}
          </div>

          {/* Uczciwa nota o pozostałych usługach (miejsca / bagaż à la carte) */}
          <p className="mt-3 rounded-md border border-line bg-surface-sunken px-4 py-2.5 text-xs text-ink-muted">
            Wybór miejsc i dodatkowy bagaż mogą być dostępne zależnie od linii i taryfy — niektórzy przewoźnicy oferują je przy
            odprawie online. Cena powyżej zawiera bagaż wskazany w wybranej taryfie.
          </p>

          {error && (
            <div className="mt-4 rounded-md border border-error/30 bg-error/5 px-4 py-3 text-sm font-medium text-error">
              {error}
              {/* Recovery: odbuduj URL wyników z flow + fresh=1 (świeże oferty, nie ta
                  sama wygasła). Pusty „/loty/wyniki" dawał ślepy zaułek. */}
              <button
                onClick={() => router.push(buildResultsUrl(flow, { fresh: true }))}
                className="ml-2 font-semibold underline underline-offset-2"
              >
                Wróć do wyników
              </button>
            </div>
          )}

          {/* Akcje desktopowe — na mobile robi to sticky pasek na dole. */}
          <div className="mt-6 hidden items-center justify-between gap-3 lg:flex">
            <button
              onClick={() => router.back()}
              className="inline-flex h-11 items-center gap-1.5 rounded-md px-3 text-sm font-semibold text-ink-muted transition hover:bg-surface-sunken hover:text-ink active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <ArrowLeft aria-hidden className="h-4 w-4" strokeWidth={2} />
              Wróć do wyników
            </button>
            <button
              onClick={() => void proceed()}
              disabled={verifying || !selected}
              className="inline-flex h-12 items-center justify-center rounded-md bg-brand px-6 font-bold text-white transition hover:opacity-90 active:scale-[0.98] disabled:opacity-60 motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <span className="text-sm">{ctaLabel} →</span>
            </button>
          </div>
        </div>

        {/* ── Kolumna lotu (sticky na desktopie, u góry na mobile) ── */}
        <aside className="order-1 lg:order-2 lg:sticky lg:top-24 lg:h-fit">
          <div className="rounded-lg border border-line bg-surface-raised p-4 shadow-sm">
            <h2 className="text-sm font-bold text-ink">Twój lot</h2>
            <FlightItinerarySummary offer={flow.offer} depart={flow.depart} ret={flow.ret} className="mt-2" />
          </div>
        </aside>
      </div>

      {/* Mobilny pasek: kwota wybranej taryfy zawsze widoczna + akcja. */}
      <FlightStickyCta
        amount={formatFlightPriceExact(selected?.total ?? null, selected?.currency ?? "PLN")}
        amountNote={
          travellers > 1 && selectedAvg !== null
            ? `za ${travellers} podróżnych · śr. ${formatFlightPrice(selectedAvg)}/os.`
            : "wł. podatków i opłat"
        }
        actionLabel={ctaLabel}
        onAction={() => void proceed()}
        disabled={verifying || !selected}
      />

      {priceChange && (
        <FlightPriceChangeDialog
          oldTotal={priceChange.oldTotal}
          newTotal={priceChange.newTotal}
          currency={priceChange.currency}
          source="verify"
          onReject={() => setPriceChange(null)}
          onAccept={() => {
            const pc = priceChange;
            setPriceChange(null);
            commit(pc.fare, pc.newTotal, pc.currency);
          }}
        />
      )}
    </main>
  );
}
