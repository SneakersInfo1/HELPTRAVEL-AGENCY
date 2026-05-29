"use client";

// "Zapisz na później" for a hotel — a lightweight engagement/lead signal.
//
// Deliberately self-contained and SAFE: localStorage only (no PII, no
// backend, no involvement with the booking/payment flow — NON-NEGOTIABLE
// RULE 6 is untouched). Fires a `hotel_save` GA4 event on save so we can
// measure intent and (later) re-engage. Reading happens after mount to stay
// SSR-safe — the server can't see localStorage, so we render the unsaved
// state first and hydrate the real state in an effect (no hydration
// mismatch because the initial state matches the server).

import { useEffect, useState } from "react";

import { track } from "@/lib/analytics/track";

const STORAGE_KEY = "ht_saved_hotels";
const MAX_SAVED = 50;

interface SavedHotel {
  id: string;
  name: string;
  city?: string;
  href: string;
  savedAt: number;
}

function readSaved(): SavedHotel[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedHotel[]) : [];
  } catch {
    return [];
  }
}

export function SaveHotelButton({
  hotelId,
  name,
  city,
  href,
}: {
  hotelId: string;
  name: string;
  city?: string;
  href: string;
}) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSaved(readSaved().some((h) => h.id === hotelId));
  }, [hotelId]);

  function toggle() {
    const current = readSaved();
    const exists = current.some((h) => h.id === hotelId);
    const next = exists
      ? current.filter((h) => h.id !== hotelId)
      : [{ id: hotelId, name, city, href, savedAt: Date.now() }, ...current].slice(0, MAX_SAVED);

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage disabled / quota exceeded — never break the page
    }

    if (!exists) track("hotel_save", { hotel_id: hotelId, destination: city });
    setSaved(!exists);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={saved}
      aria-label={saved ? `Usuń ${name} z zapisanych` : `Zapisz ${name} na później`}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition ${
        saved
          ? "bg-emerald-600 text-white hover:bg-emerald-700"
          : "border border-neutral-300 bg-white text-neutral-700 hover:border-emerald-400 hover:text-emerald-700"
      }`}
    >
      <span aria-hidden>{saved ? "♥" : "♡"}</span>
      {saved ? "Zapisano" : "Zapisz"}
    </button>
  );
}
