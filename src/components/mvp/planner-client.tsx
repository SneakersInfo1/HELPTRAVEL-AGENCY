"use client";

import Image from "next/image";
import Link from "next/link";
import { startTransition, useEffect, useState, type ReactNode } from "react";

import { ActivityOffersPanel } from "@/components/mvp/activity-offers-panel";
import { DestinationAttractionsPanel } from "@/components/mvp/destination-attractions-panel";
import { FlightOffersPanel } from "@/components/mvp/flight-offers-panel";
import { StayOffersPanel } from "@/components/mvp/stay-offers-panel";
import { TravelPackagePanel } from "@/components/mvp/travel-package-panel";
import { TransferOffersPanel } from "@/components/mvp/transfer-offers-panel";
import { getDestinationStory } from "@/lib/mvp/destination-content";
import { buildRedirectHref } from "@/lib/mvp/providers";
import type { DiscoveryResponse, SavedTripView } from "@/lib/mvp/types";

type Mode = "discovery" | "standard";

const scoreLabel = (score: number) => (score >= 82 ? "Bardzo mocne dopasowanie" : score >= 70 ? "Dobre dopasowanie" : "Warte rozwazenia");

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Zapytanie nie powiodlo sie (${response.status}).`);
  return (await response.json()) as T;
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className="w-full rounded-2xl border border-emerald-900/12 bg-white px-4 py-3 text-sm text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70" />;
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className="min-h-36 w-full rounded-2xl border border-emerald-900/12 bg-white px-4 py-3 text-sm leading-6 text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70" />;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
      {label}
      <div className="mt-2">{children}</div>
    </label>
  );
}

const discoveryPresets = [
  "Chce poleciec do cieplego kraju do 2000 zl na 5 dni, bez wizy, z plaza i zwiedzaniem.",
  "Szukam taniego city breaku z dobrym jedzeniem i krotkim lotem.",
  "Chce wyjazd bez stresu, z dobra pogoda i fajnymi widokami.",
];

const standardPresets = ["Malaga", "Barcelona", "Lizbona", "Walencja"];

export function PlannerClient({ initialMode = "discovery", initialQuery = "" }: { initialMode?: Mode; initialQuery?: string }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DiscoveryResponse | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState("");
  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({});
  const [savedTrips, setSavedTrips] = useState<SavedTripView[]>([]);

  const [query, setQuery] = useState(initialQuery || "Chce poleciec do cieplego kraju do 2000 zl na 5 dni, bez wizy, z plaza i zwiedzaniem.");
  const [budget, setBudget] = useState(2500);
  const [travelers, setTravelers] = useState(2);
  const [durationMin, setDurationMin] = useState(4);
  const [durationMax, setDurationMax] = useState(5);
  const [originCity, setOriginCity] = useState("Warszawa");
  const [destinationHint, setDestinationHint] = useState(initialMode === "standard" && initialQuery ? initialQuery : "Malaga");
  const [standardDays, setStandardDays] = useState(4);
  const [standardStyle, setStandardStyle] = useState("city break");

  useEffect(() => {
    fetch("/api/trips/history")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setSavedTrips(data?.items ?? []))
      .catch(() => setSavedTrips([]));
  }, []);

  const runPlanner = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const data =
        mode === "discovery"
          ? await postJson<DiscoveryResponse>("/api/discovery", {
              query,
              originCity,
              travelers,
              budgetMaxPln: budget,
              durationMinDays: durationMin,
              durationMaxDays: durationMax,
            })
          : await postJson<DiscoveryResponse>("/api/standard", {
              originCity,
              destinationHint,
              travelers,
              budgetMaxPln: budget,
              durationDays: standardDays,
              style: standardStyle,
            });

      startTransition(() => {
        setResult(data);
        setSelectedOptionId(data.options[0]?.itineraryResultId ?? "");
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udalo sie wygenerowac planu.");
    } finally {
      setLoading(false);
    }
  };

  const onSave = async (itineraryResultId: string) => {
    setSavingMap((prev) => ({ ...prev, [itineraryResultId]: true }));
    try {
      await postJson("/api/trips/save", { itineraryResultId });
      const response = await fetch("/api/trips/history");
      if (response.ok) {
        const data = (await response.json()) as { items?: SavedTripView[] };
        setSavedTrips(data.items ?? []);
      }
    } finally {
      setSavingMap((prev) => ({ ...prev, [itineraryResultId]: false }));
    }
  };

  const selectedOption = result?.options.find((option) => option.itineraryResultId === selectedOptionId) ?? result?.options[0];
  const selectedStory = selectedOption ? getDestinationStory(selectedOption.destination) : null;
  const destinationFocus = result?.interpreted.destinationFocus;
  const localFocus = Boolean(destinationFocus && selectedOption && selectedOption.destination.slug === destinationFocus);
  const isVirtualSelection = Boolean(selectedOption?.itineraryResultId.startsWith("virtual_"));

  const buildSelectedRedirectHref = (providerKey: "flights" | "stays" | "attractions", url: string) =>
    buildRedirectHref({
      providerKey,
      targetUrl: url,
      itineraryResultId: selectedOption?.itineraryResultId,
      destinationSlug: selectedOption?.destination.slug,
      requestId: result?.requestId,
      city: selectedOption?.destination.city,
      country: selectedOption?.destination.country,
      source: "planner",
      rank: selectedOption?.rank,
      query: result?.rawQuery,
    });

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className="glass-panel rounded-[2rem] border border-emerald-900/10 p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Planner podrozy</p>
            <h1 className="mt-2 text-3xl font-bold text-emerald-950 sm:text-4xl">Premium planowanie wyjazdu</h1>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-emerald-900/78">
              Wpisz potrzebe albo konkretny kierunek, a pokazemy ranking dopasowania, lokalny kontekst, zdjecia i realne oferty z dostepnych feedow.
            </p>
          </div>

          <div className="inline-flex rounded-full border border-emerald-900/10 bg-white/80 p-1 shadow-sm">
            <button type="button" onClick={() => setMode("discovery")} className={`rounded-full px-4 py-2 text-sm font-semibold ${mode === "discovery" ? "bg-emerald-700 text-white" : "text-emerald-900 hover:bg-emerald-100"}`}>
              Nie wiem, dokad leciec
            </button>
            <button type="button" onClick={() => setMode("standard")} className={`rounded-full px-4 py-2 text-sm font-semibold ${mode === "standard" ? "bg-emerald-700 text-white" : "text-emerald-900 hover:bg-emerald-100"}`}>
              Mam kierunek
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[1.75rem] border border-emerald-900/10 bg-emerald-50/60 p-4 sm:p-5">
            {mode === "discovery" ? (
              <div className="space-y-4">
                <label className="block text-sm font-semibold text-emerald-950">
                  Opisz, czego szukasz
                  <Textarea value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Np. chce poleciec do cieplego kraju do 2000 zl na 5 dni, bez wizy, z plaza i zwiedzaniem." />
                </label>
                <div className="flex flex-wrap gap-2">
                  {discoveryPresets.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setQuery(preset)}
                      className="rounded-full border border-emerald-900/10 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-950 transition duration-200 hover:-translate-y-0.5 hover:border-emerald-500/40 hover:bg-emerald-50"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Budzet (PLN)"><Input type="number" value={budget} onChange={(e) => setBudget(Number(e.target.value))} /></Field>
                  <Field label="Osob"><Input type="number" min={1} max={8} value={travelers} onChange={(e) => setTravelers(Number(e.target.value))} /></Field>
                  <Field label="Dni od"><Input type="number" min={2} max={14} value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value))} /></Field>
                  <Field label="Dni do"><Input type="number" min={2} max={14} value={durationMax} onChange={(e) => setDurationMax(Number(e.target.value))} /></Field>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {standardPresets.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setDestinationHint(preset)}
                      className="rounded-full border border-emerald-900/10 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-950 transition duration-200 hover:-translate-y-0.5 hover:border-emerald-500/40 hover:bg-emerald-50"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Skad wylot"><Input value={originCity} onChange={(e) => setOriginCity(e.target.value)} /></Field>
                  <Field label="Kierunek"><Input value={destinationHint} onChange={(e) => setDestinationHint(e.target.value)} /></Field>
                  <Field label="Budzet (PLN)"><Input type="number" value={budget} onChange={(e) => setBudget(Number(e.target.value))} /></Field>
                  <Field label="Dni"><Input type="number" min={2} max={14} value={standardDays} onChange={(e) => setStandardDays(Number(e.target.value))} /></Field>
                  <Field label="Styl"><Input value={standardStyle} onChange={(e) => setStandardStyle(e.target.value)} /></Field>
                </div>
              </div>
            )}
          </div>

          <aside className="rounded-[1.75rem] border border-emerald-900/10 bg-white p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Zapisane plany</p>
                <h2 className="mt-1 text-lg font-bold text-emerald-950">Historia sesji</h2>
              </div>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900">{savedTrips.length}</span>
            </div>
            <div className="mt-4 max-h-48 space-y-2 overflow-y-auto pr-1">
              {savedTrips.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-emerald-900/10 bg-emerald-50/60 px-4 py-4 text-sm text-emerald-900/70">Zapisane plany pojawia sie tutaj po pierwszym wyniku.</p>
              ) : (
                savedTrips.map((trip) => (
                  <Link key={trip.itineraryResultId} href={`/trips/${trip.itineraryResultId}`} className="flex items-center justify-between rounded-2xl border border-emerald-900/10 bg-emerald-50/70 px-4 py-3 text-sm font-medium text-emerald-950 transition hover:border-emerald-500/50 hover:bg-emerald-50">
                    <span>
                      {trip.city}, {trip.country}
                    </span>
                    <span className="text-xs text-emerald-700">score {trip.score.toFixed(0)}</span>
                  </Link>
                ))
              )}
            </div>
            <button type="button" onClick={runPlanner} disabled={loading} className="mt-4 w-full rounded-full bg-emerald-700 px-4 py-3 text-sm font-bold text-white shadow-[0_16px_30px_rgba(21,128,61,0.22)] transition hover:bg-emerald-800 disabled:opacity-70">
              {loading ? "Tworzymy ranking..." : "Wygeneruj rekomendacje"}
            </button>
            {error ? <p className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
          </aside>
        </div>
      </section>

      {loading ? (
        <section className="grid gap-4">
          {[1, 2, 3].map((index) => (
            <div key={index} className="animate-pulse rounded-[1.75rem] border border-emerald-900/10 bg-white/80 p-4">
              <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
                <div className="h-44 rounded-[1.25rem] bg-emerald-100/80" />
                <div className="space-y-3">
                  <div className="h-5 w-40 rounded-full bg-emerald-100/80" />
                  <div className="h-7 w-2/3 rounded-full bg-emerald-100/80" />
                  <div className="h-4 w-full rounded-full bg-emerald-100/80" />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="h-10 rounded-2xl bg-emerald-100/80" />
                    <div className="h-10 rounded-2xl bg-emerald-100/80" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {result && selectedOption && selectedStory ? (
        <>
          <section className="grid gap-5 rounded-[2rem] border border-emerald-900/10 bg-white/92 p-4 sm:p-6">
            <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="overflow-hidden rounded-[1.75rem] border border-emerald-900/10">
                <div className="relative h-72">
                  <Image src={selectedStory.heroImage} alt={selectedStory.name} fill priority className="object-cover" sizes="(max-width: 1024px) 100vw, 55vw" />
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,16,10,0.02)_0%,rgba(6,16,10,0.62)_100%)]" />
                  <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">{mode === "discovery" ? "Tryb: nie wiem, dokad leciec" : "Tryb: mam kierunek"}</p>
                    <h2 className="mt-2 text-3xl font-bold">{selectedStory.name}</h2>
                    <p className="mt-2 max-w-xl text-sm leading-6 text-white/84">{selectedStory.tagline}</p>
                  </div>
                </div>
                <div className="grid gap-4 p-5 sm:grid-cols-2">
                  <div className="rounded-2xl bg-emerald-50/75 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Wynik</p>
                    <p className="mt-1 text-2xl font-bold text-emerald-950">{selectedOption.score.toFixed(0)}</p>
                    <p className="text-sm text-emerald-900/74">{scoreLabel(selectedOption.score)}</p>
                  </div>
                  <div className="rounded-2xl bg-emerald-50/75 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Styl</p>
                    <p className="mt-1 text-sm font-semibold text-emerald-950">{selectedStory.vibe}</p>
                  </div>
                </div>
                <div className="grid gap-2 border-t border-emerald-900/10 bg-emerald-50/50 p-5 sm:grid-cols-3">
                  {selectedStory.gallery.map((imageUrl, index) => (
                    <div key={imageUrl} className="relative h-24 overflow-hidden rounded-2xl">
                      <Image src={imageUrl} alt={`${selectedStory.name} galeria ${index + 1}`} fill className="object-cover transition duration-500 hover:scale-105" sizes="(max-width: 640px) 100vw, 18vw" />
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                {localFocus ? (
                  <div className="rounded-[1.5rem] border border-emerald-500/20 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-950">To wynik dopasowany dokladnie do kierunku wpisanego przez uzytkownika.</div>
                ) : null}

                <div className="rounded-[1.75rem] border border-emerald-900/10 bg-emerald-50/70 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Dlaczego ten kierunek</p>
                  <p className="mt-3 text-sm leading-7 text-emerald-900/82">{selectedStory.summary}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {selectedStory.bestFor.map((tag) => (
                      <span key={tag} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-900 shadow-sm">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="rounded-[1.75rem] border border-emerald-900/10 bg-white p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Najmocniejsze punkty</p>
                  <ul className="mt-3 space-y-2 text-sm leading-6 text-emerald-900/82">
                    {selectedStory.highlights.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-[1.75rem] border border-emerald-900/10 bg-white p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Lokalny klimat</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-emerald-50/70 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Atrakcje</p>
                      <p className="mt-2 text-sm leading-6 text-emerald-900/82">{selectedStory.attractions.slice(0, 3).join(" • ")}</p>
                    </div>
                    <div className="rounded-2xl bg-emerald-50/70 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Jedzenie</p>
                      <p className="mt-2 text-sm leading-6 text-emerald-900/82">{selectedStory.foodSpots.slice(0, 2).join(" • ")}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
              <div className="rounded-[1.75rem] border border-emerald-900/10 bg-white p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Plan wyjazdu</p>
                <div className="mt-3 grid gap-3">
                  {selectedOption.aiPlan.map((dayPlan) => (
                    <article key={dayPlan.day} className="rounded-2xl bg-emerald-50/70 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Dzien {dayPlan.day}</p>
                      <h3 className="mt-1 text-sm font-bold text-emerald-950">{dayPlan.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-emerald-900/82">{dayPlan.description}</p>
                    </article>
                  ))}
                </div>
              </div>

              <div className="rounded-[1.75rem] border border-emerald-900/10 bg-white p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Dzielnice i jedzenie</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedStory.districts.map((district) => (
                    <span key={district} className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900">
                      {district}
                    </span>
                  ))}
                </div>
                <ul className="mt-4 space-y-2 text-sm leading-7 text-emerald-900/82">
                  {selectedStory.foodSpots.map((spot) => (
                    <li key={spot}>• {spot}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <a href={buildSelectedRedirectHref("flights", selectedOption.destination.affiliateLinks.flights)} target="_blank" rel="noreferrer" className="rounded-full bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800">
                Zobacz loty
              </a>
              <a href={buildSelectedRedirectHref("stays", selectedOption.destination.affiliateLinks.stays)} target="_blank" rel="noreferrer" className="rounded-full border border-emerald-900/12 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-50">
                Zobacz noclegi
              </a>
              <a href={buildSelectedRedirectHref("attractions", selectedOption.destination.affiliateLinks.attractions)} target="_blank" rel="noreferrer" className="rounded-full border border-emerald-900/12 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-50">
                Zobacz atrakcje
              </a>
              {!isVirtualSelection ? (
                <>
                  <button type="button" onClick={() => void onSave(selectedOption.itineraryResultId)} disabled={savingMap[selectedOption.itineraryResultId]} className="rounded-full border border-emerald-900/12 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-100 disabled:opacity-70">
                    {savingMap[selectedOption.itineraryResultId] ? "Zapisywanie..." : "Zapisz plan"}
                  </button>
                  <Link href={`/trips/${selectedOption.itineraryResultId}`} className="rounded-full border border-emerald-900/12 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-50">
                    Otworz szczegoly
                  </Link>
                </>
              ) : (
                <span className="rounded-full border border-emerald-900/12 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-950">
                  Kierunek z podpowiedzi API - otworz partnerow lub oferty ponizej
                </span>
              )}
            </div>
          </section>

          <div className="grid gap-5">
            <TravelPackagePanel destinationCity={selectedOption.destination.city} destinationCountry={selectedOption.destination.country} destinationImage={selectedStory.heroImage} defaultOriginCity={originCity} defaultPassengers={travelers} />
            <FlightOffersPanel destinationCity={selectedOption.destination.city} destinationCountry={selectedOption.destination.country} defaultOriginCity={originCity} passengers={travelers} />
            <StayOffersPanel destinationCity={selectedOption.destination.city} destinationCountry={selectedOption.destination.country} defaultPassengers={travelers} />
            <DestinationAttractionsPanel city={selectedOption.destination.city} country={selectedOption.destination.country} />
            <ActivityOffersPanel destinationCity={selectedOption.destination.city} destinationCountry={selectedOption.destination.country} defaultTravelers={travelers} />
            <TransferOffersPanel destinationCity={selectedOption.destination.city} destinationCountry={selectedOption.destination.country} defaultPassengers={travelers} />
          </div>
        </>
      ) : null}

      {result ? (
        <section className="grid gap-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Pozostale propozycje</p>
              <h2 className="mt-1 text-2xl font-bold text-emerald-950">3-5 najlepszych kierunkow</h2>
            </div>
            <p className="max-w-xl text-sm leading-7 text-emerald-900/72">
              Kazda karta ma zdjecie, lokalny opis i uzasadnienie dopasowania. Realne ceny pokazujemy w dedykowanych panelach lotow, noclegow i atrakcji.
            </p>
          </div>

          <div className="grid gap-4">
            {result.options.map((option) => {
              const story = getDestinationStory(option.destination);
              const active = option.itineraryResultId === selectedOptionId;
              return (
                <article
                  key={option.itineraryResultId}
                  onClick={() => setSelectedOptionId(option.itineraryResultId)}
                  className={`group cursor-pointer overflow-hidden rounded-[1.75rem] border bg-white shadow-[0_16px_40px_rgba(16,84,48,0.07)] transition-all duration-300 ${active ? "border-emerald-500/70 ring-1 ring-emerald-300" : "border-emerald-900/10 hover:-translate-y-1 hover:border-emerald-500/45 hover:shadow-[0_20px_48px_rgba(16,84,48,0.12)]"}`}
                >
                  <div className="grid gap-0 lg:grid-cols-[320px_1fr]">
                    <div className="relative h-56 lg:h-full">
                      <Image src={story.heroImage} alt={story.name} fill sizes="(max-width: 1024px) 100vw, 320px" className="object-cover transition duration-500 group-hover:scale-105" />
                      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,16,10,0.02)_0%,rgba(6,16,10,0.52)_100%)]" />
                      <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200">{story.tagline}</p>
                        <h3 className="mt-2 text-2xl font-bold">
                          {option.destination.city}, {option.destination.country}
                        </h3>
                      </div>
                    </div>

                    <div className="p-5 sm:p-6">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Pozycja #{option.rank}</p>
                          <p className="mt-2 text-2xl font-bold text-emerald-950">{scoreLabel(option.score)}</p>
                        </div>
                        <div className="rounded-2xl bg-emerald-700 px-4 py-2 text-right text-white">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-emerald-100">Wynik</p>
                          <p className="text-2xl font-bold">{option.score.toFixed(0)}</p>
                        </div>
                      </div>

                      <p className="mt-4 max-w-3xl text-sm leading-7 text-emerald-900/80">{option.aiSummary}</p>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {story.bestFor.slice(0, 3).map((tag) => (
                          <span key={tag} className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900">
                            {tag}
                          </span>
                        ))}
                      </div>

                      <div className="mt-4 grid gap-2 sm:grid-cols-3">
                        {story.gallery.map((imageUrl, index) => (
                          <div key={`${option.itineraryResultId}-${imageUrl}`} className="relative h-20 overflow-hidden rounded-2xl border border-emerald-900/10">
                            <Image src={imageUrl} alt={`${story.name} zdjecie ${index + 1}`} fill sizes="(max-width: 640px) 100vw, 11vw" className="object-cover transition duration-500 group-hover:scale-105" />
                          </div>
                        ))}
                      </div>

                      <div className="mt-5 grid gap-4 md:grid-cols-2">
                        <div className="rounded-[1.25rem] bg-emerald-50/70 p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Dlaczego pasuje</p>
                          <ul className="mt-2 space-y-2 text-sm leading-6 text-emerald-900/82">
                            {option.reasons.slice(0, 3).map((reason) => (
                              <li key={reason}>• {reason}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="rounded-[1.25rem] bg-emerald-50/70 p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Na co uwazac</p>
                          <ul className="mt-2 space-y-2 text-sm leading-6 text-emerald-900/82">
                            {(option.tradeoffs.length > 0 ? option.tradeoffs : ["Brak istotnych minusow."]).map((tradeoff) => (
                              <li key={tradeoff}>• {tradeoff}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
