// /hotele — hotel search landing. Master spec §5.1.

import type { Metadata } from "next";
import Link from "next/link";

import { HotelSearchForm } from "./_components/search-form";

export const metadata: Metadata = {
  title: "Hotele w Europie i basenie Morza Śródziemnego | HelpTravel",
  description:
    "Znajdź hotel z prawdziwymi cenami w PLN. Bezpłatna anulacja w wybranych hotelach, polskie wsparcie, faktura VAT na życzenie.",
  alternates: { canonical: "/hotele" },
};

const TRUST_BADGES: Array<{ icon: string; title: string; body: string }> = [
  { icon: "🇵🇱", title: "Płacisz w PLN", body: "Bez przewalutowania w karcie." },
  { icon: "↩️", title: "Bezpłatna anulacja", body: "W wybranych hotelach — widoczne przy ofercie." },
  { icon: "💬", title: "Wsparcie po polsku", body: "Pomoc na każdym etapie rezerwacji." },
  { icon: "🧾", title: "Faktura VAT", body: "Wystawiamy na życzenie — w trakcie rezerwacji." },
];

const POPULAR: Array<{ city: string; country: string; img?: string }> = [
  { city: "Barcelona", country: "Spain" },
  { city: "Lisbon", country: "Portugal" },
  { city: "Rome", country: "Italy" },
  { city: "Athens", country: "Greece" },
  { city: "Malaga", country: "Spain" },
  { city: "Istanbul", country: "Turkey" },
  { city: "Funchal", country: "Portugal" },
  { city: "Valencia", country: "Spain" },
];

export default function HotelLandingPage() {
  return (
    <main className="min-h-screen bg-neutral-50">
      {/* Hero */}
      <section className="relative bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-600 text-white">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full bg-white/15 px-3 py-1 font-medium">Hotele</span>
            <Link
              href="/planner?mode=discovery"
              className="rounded-full bg-white/10 px-3 py-1 font-medium underline-offset-2 hover:bg-white/20 hover:underline"
            >
              Nie wiem dokąd lecieć →
            </Link>
          </div>
          <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
            Hotel w Twoim budżecie. Ceny w PLN, bez niespodzianek.
          </h1>
          <p className="mt-3 max-w-2xl text-emerald-50/90 sm:text-lg">
            Rezerwujesz bezpośrednio na HelpTravel — to my zajmujemy się płatnością i potwierdzeniem.
          </p>
          <div className="mt-6">
            <HotelSearchForm />
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-y border-neutral-200 bg-white">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-4 px-4 py-6 md:grid-cols-4">
          {TRUST_BADGES.map((b) => (
            <div key={b.title} className="flex items-start gap-3">
              <div className="text-2xl" aria-hidden>{b.icon}</div>
              <div>
                <div className="text-sm font-semibold text-neutral-900">{b.title}</div>
                <div className="text-xs text-neutral-600">{b.body}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Popular destinations */}
      <section className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-2xl font-bold text-neutral-900">Popularne kierunki</h2>
          <Link href="/kierunki" className="text-sm font-medium text-emerald-700 hover:text-emerald-800">
            Wszystkie kierunki →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {POPULAR.map((p) => (
            <Link
              key={`${p.city}-${p.country}`}
              href={`/hotele/szukaj?destination=${encodeURIComponent(p.city)}&country=${encodeURIComponent(p.country)}`}
              className="group rounded-xl border border-neutral-200 bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="text-base font-semibold text-neutral-900">{p.city}</div>
              <div className="text-sm text-neutral-500">{p.country}</div>
              <div className="mt-2 text-sm font-medium text-emerald-700 group-hover:text-emerald-800">
                Sprawdź hotele →
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Discovery cross-link */}
      <section className="bg-neutral-100">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <div className="rounded-2xl bg-white p-6 sm:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-medium text-emerald-700">Discovery Planner</div>
                <h3 className="mt-1 text-xl font-bold text-neutral-900">Nie wiesz, dokąd? Zacznij od pomysłu.</h3>
                <p className="mt-1 max-w-xl text-sm text-neutral-600">
                  Powiedz nam, na co masz ochotę i jaki masz budżet — pokażemy 3-5 dopasowanych
                  miast z gotowymi hotelami.
                </p>
              </div>
              <Link
                href="/planner?mode=discovery"
                className="inline-flex h-11 items-center justify-center rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Otwórz planer
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
