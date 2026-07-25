"use client";

// Klient potwierdzenia: GET stanu sagi + polling co 10 s, dopóki ticketing
// w toku (FLIGHT_BOOKED). Zero udawania: każdy stan ma uczciwy komunikat.

import { useEffect, useState } from "react";
import Link from "next/link";

interface SagaView {
  state?: string;
  hotelBookingId?: string | null;
  flightBookingId?: string | null;
  deadlineAt?: string | null;
  offer?: { hotelName?: string; destination?: string; dateFrom?: string; dateTo?: string } | null;
}

const POLL_MS = 10_000;

export function PackageConfirmation({ sagaId }: { sagaId: string }) {
  const [data, setData] = useState<SagaView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const load = async () => {
      try {
        const res = await fetch(`/api/pakiety/checkout/${encodeURIComponent(sagaId)}`);
        if (res.status === 404) {
          setError("Nie znaleźliśmy takiej rezerwacji.");
          return;
        }
        const body = (await res.json()) as SagaView;
        if (stopped) return;
        setData(body);
        if (body.state === "FLIGHT_BOOKED" || body.state === "COMPENSATING") {
          timer = setTimeout(load, POLL_MS); // ticketing/zwrot w toku — odświeżaj
        }
      } catch {
        if (!stopped) setError("Problem z połączeniem — odśwież stronę.");
      }
    };
    void load();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [sagaId]);

  const box = "mx-auto w-full max-w-lg px-4 py-10";

  if (error) {
    return (
      <div className={`${box} text-center`}>
        <h1 className="text-lg font-bold text-neutral-900">{error}</h1>
        <Link href="/" className="mt-4 inline-flex h-10 items-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white">Strona główna</Link>
      </div>
    );
  }
  if (!data) {
    return (
      <div className={`${box} text-center`} aria-busy>
        <div aria-hidden className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-[3px] border-emerald-200 border-t-emerald-600 motion-reduce:animate-none" />
        <p className="text-sm text-neutral-600">Wczytujemy status rezerwacji…</p>
      </div>
    );
  }

  const s = data.state ?? "";
  const header =
    s === "CONFIRMED"
      ? { icon: "✓", title: "Pakiet potwierdzony!", sub: "Oba potwierdzenia wysłaliśmy e-mailem." }
      : s === "FLIGHT_BOOKED"
        ? { icon: "…", title: "Wystawiamy bilety lotnicze", sub: "Hotel i lot są opłacone. Potwierdzenie z numerem biletu wyślemy e-mailem — zwykle w ciągu 30 minut." }
        : s === "NEEDS_MANUAL_ACTION"
          ? { icon: "…", title: "Finalizujemy Twoją rezerwację", sub: "Zajmujemy się nią ręcznie. Potwierdzenie albo pełny zwrot — e-mail w ciągu 30 minut." }
          : s === "COMPENSATING" || s === "REFUNDED"
            ? { icon: "↩", title: "Rezerwacja anulowana — zwrot w drodze", sub: "Pełny zwrot płatności (na wyciągu: NUITEE TRAVEL). Potwierdzenie wysłaliśmy e-mailem." }
            : s === "HOTEL_BOOKED_AWAITING_FLIGHT"
              ? { icon: "1/2", title: "Hotel opłacony — dokończ płatność za lot", sub: "Wróć do rezerwacji z linku w e-mailu albo przyciskiem niżej." }
              : { icon: "…", title: "Rezerwacja w toku", sub: "Ten ekran odświeży się automatycznie." };

  return (
    <div className={box}>
      <div className="rounded-2xl border border-emerald-900/10 bg-white p-5 text-center shadow-[0_4px_16px_rgba(16,84,48,0.06)]">
        <div aria-hidden className={`mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full text-xl font-bold ${s === "CONFIRMED" ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-700"}`}>
          {header.icon}
        </div>
        <h1 className="text-xl font-bold text-neutral-900">{header.title}</h1>
        <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-neutral-600">{header.sub}</p>

        {data.offer?.hotelName && (
          <p className="mt-3 text-sm text-neutral-700">
            <span className="font-semibold">{data.offer.hotelName}</span>
            {data.offer.destination ? ` · ${data.offer.destination}` : ""}
            {data.offer.dateFrom && data.offer.dateTo ? ` · ${data.offer.dateFrom} → ${data.offer.dateTo}` : ""}
          </p>
        )}

        {/* Dwa numery — wyraźnie oddzielone (dwie usługi, dwa potwierdzenia). */}
        {(data.hotelBookingId || data.flightBookingId) && (
          <dl className="mt-4 grid grid-cols-1 gap-2 text-left sm:grid-cols-2">
            <div className="rounded-xl bg-emerald-50 px-3 py-2.5">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">Rezerwacja hotelu</dt>
              <dd className="mt-0.5 break-all text-sm font-bold tabular-nums text-emerald-950">{data.hotelBookingId ?? "—"}</dd>
            </div>
            <div className="rounded-xl bg-emerald-50 px-3 py-2.5">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">Rezerwacja lotu</dt>
              <dd className="mt-0.5 break-all text-sm font-bold tabular-nums text-emerald-950">{data.flightBookingId ?? (s === "FLIGHT_BOOKED" ? "wystawiamy…" : "—")}</dd>
            </div>
          </dl>
        )}

        {s === "HOTEL_BOOKED_AWAITING_FLIGHT" && (
          <Link
            href={`/pakiety/checkout?saga=${encodeURIComponent(sagaId)}&step=flight`}
            className="mt-4 inline-flex h-10 items-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Dokończ płatność za lot
          </Link>
        )}

        <p className="mt-4 text-[11px] text-neutral-400">Numer pakietu: {sagaId}</p>
      </div>
    </div>
  );
}
