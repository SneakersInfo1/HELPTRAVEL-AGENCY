"use client";

// Wspólny klient stron powrotu z płatności (hotel/lot). Zasady:
//  • redirect_status=failed → payment-failed (retryable) + powrót do kroku,
//  • sukces → hotel-paid / flight-paid; NIGDY nie udajemy sukcesu — status
//    bierzemy z odpowiedzi API (book jest autorytatywny), fail = uczciwy
//    komunikat o kompensacie, nie error 500,
//  • hotel OK → ekran przejściowy „Hotel potwierdzony ✓" (spec §4: 2 s) →
//    automatycznie Checkout 2.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { track } from "@/lib/analytics/track";

type View =
  | { kind: "processing" }
  | { kind: "hotel-ok" }
  | { kind: "failed-payment" }
  | { kind: "compensated" }
  | { kind: "manual" }
  | { kind: "error"; message: string };

export function PackageReturnClient({
  which,
  sagaId,
  redirectStatus,
}: {
  which: "hotel" | "flight";
  sagaId: string;
  redirectStatus: string | null;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>({ kind: "processing" });
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current || !sagaId) return;
    ran.current = true;

    void (async () => {
      try {
        if (redirectStatus === "failed") {
          await fetch(`/api/pakiety/checkout/${encodeURIComponent(sagaId)}/payment-failed`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ which, reason: "redirect_status=failed (widget)" }),
          }).catch(() => {});
          setView({ kind: "failed-payment" });
          return;
        }

        const res = await fetch(`/api/pakiety/checkout/${encodeURIComponent(sagaId)}/${which === "hotel" ? "hotel-paid" : "flight-paid"}`, {
          method: "POST",
        });
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; compensated?: boolean; manual?: boolean; message?: string };

        if (!res.ok) {
          setView({ kind: "error", message: body.message ?? "Nie udało się potwierdzić płatności. Odśwież stronę — status znajdziesz też w e-mailu." });
          return;
        }
        if (body.ok) {
          if (which === "hotel") {
            track("package_purchase", { which: "hotel", saga: sagaId });
            setView({ kind: "hotel-ok" });
            setTimeout(() => router.replace(`/pakiety/checkout?saga=${encodeURIComponent(sagaId)}&step=flight`), 2000);
          } else {
            router.replace(`/pakiety/rezerwacja/${encodeURIComponent(sagaId)}`);
          }
          return;
        }
        setView(body.compensated ? { kind: "compensated" } : { kind: "manual" });
      } catch {
        setView({ kind: "error", message: "Problem z połączeniem. Odśwież stronę — status rezerwacji znajdziesz też w e-mailu." });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const box = "mx-auto w-full max-w-lg px-4 py-14 text-center";

  if (!sagaId) {
    return (
      <div className={box}>
        <h1 className="text-lg font-bold text-neutral-900">Brak identyfikatora rezerwacji</h1>
        <Link href="/pakiety/szukaj" className="mt-4 inline-flex h-10 items-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white">Wróć do wyników</Link>
      </div>
    );
  }

  switch (view.kind) {
    case "processing":
      return (
        <div className={box} aria-busy>
          <div aria-hidden className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-[3px] border-emerald-200 border-t-emerald-600 motion-reduce:animate-none" />
          <h1 className="text-lg font-bold text-neutral-900">{which === "hotel" ? "Potwierdzamy rezerwację hotelu…" : "Potwierdzamy rezerwację lotu…"}</h1>
          <p className="mt-1 text-sm text-neutral-600">Nie zamykaj tej strony — to potrwa kilka sekund.</p>
        </div>
      );
    case "hotel-ok":
      return (
        <div className={box}>
          <div aria-hidden className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-2xl text-white">✓</div>
          <h1 className="text-lg font-bold text-neutral-900">Hotel potwierdzony i opłacony</h1>
          <p className="mt-1 text-sm text-neutral-600">Przechodzimy do płatności za lot…</p>
        </div>
      );
    case "failed-payment":
      return (
        <div className={box}>
          <h1 className="text-lg font-bold text-neutral-900">Płatność nie doszła do skutku</h1>
          <p className="mt-1 text-sm leading-6 text-neutral-600">Nic nie zostało pobrane. Możesz spróbować ponownie — Twoja rezerwacja wciąż czeka.</p>
          <Link
            href={`/pakiety/checkout?saga=${encodeURIComponent(sagaId)}&step=${which}`}
            className="mt-4 inline-flex h-10 items-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Spróbuj ponownie
          </Link>
        </div>
      );
    case "compensated":
      return (
        <div className={box}>
          <h1 className="text-lg font-bold text-neutral-900">Rezerwacja hotelu nie doszła do skutku</h1>
          <p className="mt-1 text-sm leading-6 text-neutral-600">
            Pełny zwrot płatności jest w drodze (na wyciągu: NUITEE TRAVEL). Wysłaliśmy e-mail z potwierdzeniem zwrotu — przepraszamy.
          </p>
          <Link href="/pakiety/szukaj" className="mt-4 inline-flex h-10 items-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white">Wróć do wyników</Link>
        </div>
      );
    case "manual":
      return (
        <div className={box}>
          <h1 className="text-lg font-bold text-neutral-900">Finalizujemy Twoją rezerwację</h1>
          <p className="mt-1 text-sm leading-6 text-neutral-600">
            Potwierdzenie z numerami rezerwacji wyślemy e-mailem w ciągu 30 minut. Status możesz śledzić na stronie rezerwacji.
          </p>
          <Link href={`/pakiety/rezerwacja/${encodeURIComponent(sagaId)}`} className="mt-4 inline-flex h-10 items-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white">
            Zobacz status
          </Link>
        </div>
      );
    case "error":
      return (
        <div className={box}>
          <h1 className="text-lg font-bold text-neutral-900">Coś poszło nie tak</h1>
          <p className="mt-1 text-sm leading-6 text-neutral-600">{view.message}</p>
          <Link href={`/pakiety/rezerwacja/${encodeURIComponent(sagaId)}`} className="mt-4 inline-flex h-10 items-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white">
            Zobacz status rezerwacji
          </Link>
        </div>
      );
  }
}
