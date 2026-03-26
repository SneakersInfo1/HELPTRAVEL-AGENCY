"use client";

import { useEffect, useState } from "react";

import { buildRedirectHref } from "@/lib/mvp/providers";
import type { DestinationAttractionsResponse } from "@/lib/mvp/types";

function postJson<T>(url: string, body: unknown): Promise<T> {
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }).then(async (response) => {
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? `Zapytanie nie powiodło się (${response.status}).`);
    }
    return (await response.json()) as T;
  });
}

function Spinner() {
  return <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-700" />;
}

function GroupCard(props: { title: string; items: DestinationAttractionsResponse["groups"][number]["items"] }) {
  if (props.items.length === 0) {
    return null;
  }

  return (
    <section className="rounded-[1.5rem] border border-emerald-900/10 bg-white p-4">
      <h4 className="text-sm font-bold text-emerald-950">{props.title}</h4>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {props.items.map((item) => (
          <article key={item.id} className="rounded-2xl bg-emerald-50/70 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">{item.iconLabel}</p>
                <h5 className="mt-1 text-sm font-bold text-emerald-950">{item.name}</h5>
              </div>
              {item.distanceMeters ? (
                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-900 shadow-sm">
                  {Math.round(item.distanceMeters / 100) / 10} km
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-sm leading-6 text-emerald-900/78">{item.description}</p>
            <p className="mt-2 text-xs text-emerald-800">{item.address}</p>
            {item.url ? (
              <div className="mt-3">
                <a
                  href={buildRedirectHref({
                    providerKey: "attractions",
                    targetUrl: item.url,
                    city: item.name,
                    source: "attractions_panel",
                  })}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-900 shadow-sm hover:bg-emerald-100"
                >
                  Otwórz
                </a>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

export function DestinationAttractionsPanel(props: { city: string; country: string }) {
  const [data, setData] = useState<DestinationAttractionsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!props.city) return;

    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError("");
      try {
        const result = await postJson<DestinationAttractionsResponse>("/api/places/search", {
          city: props.city,
          country: props.country,
        });
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Nie udało się pobrać atrakcji.");
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [props.city, props.country, refreshTick]);

  return (
    <section className="rounded-[1.75rem] border border-emerald-900/10 bg-white p-5 shadow-[0_16px_45px_rgba(16,84,48,0.06)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Lokalne miejsca</p>
          <h3 className="mt-2 text-2xl font-bold text-emerald-950">
            Atrakcje dla {props.city}, {props.country}
          </h3>
          <p className="mt-2 text-sm leading-6 text-emerald-900/72">
            Geoapify dobiera miejsca warte odwiedzenia, muzea, punkty widokowe, plaże, parki i miejsca na jedzenie.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
          {loading ? <Spinner /> : null}
          {loading ? "Pobieranie miejsc" : data ? `Źródło: ${data.source === "geoapify" ? "Geoapify" : "fallback"}` : "Gotowe do odświeżenia"}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setRefreshTick((value) => value + 1)}
          className="rounded-full border border-emerald-900/12 bg-white px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-50"
        >
          Odśwież miejsca
        </button>
      </div>

      {error ? <div className="mt-4 rounded-[1.5rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="mt-5 grid gap-4">
        {loading ? (
          Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="animate-pulse rounded-[1.5rem] border border-emerald-900/10 bg-emerald-50/50 p-4">
              <div className="h-5 w-44 rounded-full bg-emerald-100" />
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="h-24 rounded-2xl bg-emerald-100" />
                <div className="h-24 rounded-2xl bg-emerald-100" />
              </div>
            </div>
          ))
        ) : data ? (
          data.groups.map((group) => <GroupCard key={group.key} title={group.label} items={group.items} />)
        ) : (
          <div className="rounded-[1.5rem] border border-dashed border-emerald-900/12 bg-emerald-50/60 px-4 py-6 text-sm text-emerald-900/70">
            Po wybraniu kierunku tutaj pojawią się lokalne atrakcje i miejsca warte odwiedzenia.
          </div>
        )}
      </div>
    </section>
  );
}
