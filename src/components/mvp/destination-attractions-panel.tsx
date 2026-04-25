"use client";

import { useEffect, useState } from "react";

import { Spinner } from "@/components/ui/spinner";
import { useLanguage } from "@/components/site/language-provider";
import { postJson } from "@/lib/fetch-json";
import { buildRedirectHref } from "@/lib/mvp/providers";
import type { DestinationAttractionsResponse } from "@/lib/mvp/types";

const copy = {
  pl: {
    requestError: "Nie udalo sie pobrac lokalnych miejsc.",
    openPlace: "Otwórz miejsce",
    eyebrow: "Miejsca na miejscu",
    title: "Co warto zobaczyc w",
    body: "Najważniejsze punkty widokowe, muzea, plażę, parki i miejsca na jedzenie zebrane w jednym widoku.",
    loading: "Pobieramy miejsca",
    places: "miejsc",
    ready: "Gotowe",
    refresh: "Odswiez propozycje",
    empty: "Po wyborze kierunku pokazujemy tutaj miejsca warte odwiedzenia i szybkie przejścia do lokalnych atrakcji.",
  },
  en: {
    requestError: "Could not load local places.",
    openPlace: "Open place",
    eyebrow: "On-the-ground places",
    title: "What to see in",
    body: "Key viewpoints, museums, beaches, parks and food spots collected in one fast overview.",
    loading: "Loading places",
    places: "places",
    ready: "Ready",
    refresh: "Refresh places",
    empty: "Once a destination is chosen, this area will show worthwhile places and quick jumps to local attractions.",
  },
} as const;

function GroupCard(props: {
  title: string;
  items: DestinationAttractionsResponse["groups"][number]["items"];
  openLabel: string;
}) {
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
                  className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-900 shadow-sm transition hover:bg-emerald-100"
                >
                  {props.openLabel}
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
  const { locale } = useLanguage();
  const text = copy[locale];
  const [data, setData] = useState<DestinationAttractionsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!props.city) {
      return;
    }

    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError("");

      try {
        const result = await postJson<DestinationAttractionsResponse>("/api/places/search", {
          city: props.city,
          country: props.country,
        });

        if (!cancelled) {
          setData(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : text.requestError);
          setData(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [props.city, props.country, refreshTick, text.requestError]);

  return (
    <section className="rounded-[1.75rem] border border-emerald-900/10 bg-white p-5 shadow-[0_16px_45px_rgba(16,84,48,0.06)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">{text.eyebrow}</p>
          <h3 className="mt-2 text-2xl font-bold text-emerald-950">
            {text.title} {props.city}
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-900/72">{text.body}</p>
        </div>

        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
          {loading ? <Spinner /> : null}
          {loading ? text.loading : data ? `${data.groups.reduce((sum, group) => sum + group.items.length, 0)} ${text.places}` : text.ready}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setRefreshTick((value) => value + 1)}
          className="rounded-full border border-emerald-900/12 bg-white px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-50"
        >
          {text.refresh}
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
          data.groups.map((group) => <GroupCard key={group.key} title={group.label} items={group.items} openLabel={text.openPlace} />)
        ) : (
          <div className="rounded-[1.5rem] border border-dashed border-emerald-900/12 bg-emerald-50/60 px-4 py-6 text-sm text-emerald-900/70">
            {text.empty}
          </div>
        )}
      </div>
    </section>
  );
}

