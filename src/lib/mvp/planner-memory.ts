"use client";

export interface PlannerSnapshot {
  mode: "discovery" | "standard";
  query: string;
  destinationHint: string;
  originCity: string;
  budget: number;
  travelers: number;
  rooms: number;
  durationMin: number;
  durationMax: number;
  travelStartDate: string;
  travelNights: number;
  selectedDestinationSlug?: string;
  selectedDestinationLabel?: string;
  savedAt: string;
}

export interface RecentDiscoveryBrief {
  id: string;
  text: string;
  savedAt: string;
}

export interface SavedDestinationMemory {
  slug: string;
  city: string;
  country: string;
  savedAt: string;
}

const LAST_PLAN_KEY = "helptravel:last-plan";
const RECENT_BRIEFS_KEY = "helptravel:recent-briefs";
const SAVED_DESTINATIONS_KEY = "helptravel:saved-destinations";

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }

    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota or privacy mode failures.
  }
}

export function getPlannerSnapshot(): PlannerSnapshot | null {
  return readJson<PlannerSnapshot | null>(LAST_PLAN_KEY, null);
}

export function savePlannerSnapshot(snapshot: PlannerSnapshot): void {
  writeJson(LAST_PLAN_KEY, snapshot);
}

export function getRecentDiscoveryBriefs(limit = 4): RecentDiscoveryBrief[] {
  return readJson<RecentDiscoveryBrief[]>(RECENT_BRIEFS_KEY, [])
    .sort((left, right) => right.savedAt.localeCompare(left.savedAt))
    .slice(0, limit);
}

export function pushRecentDiscoveryBrief(text: string): RecentDiscoveryBrief[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return getRecentDiscoveryBriefs();
  }

  const next: RecentDiscoveryBrief[] = [
    {
      id: trimmed.toLowerCase(),
      text: trimmed,
      savedAt: new Date().toISOString(),
    },
    ...getRecentDiscoveryBriefs(8).filter((item) => item.text.toLowerCase() !== trimmed.toLowerCase()),
  ].slice(0, 6);

  writeJson(RECENT_BRIEFS_KEY, next);
  return next;
}

export function getSavedDestinations(): SavedDestinationMemory[] {
  return readJson<SavedDestinationMemory[]>(SAVED_DESTINATIONS_KEY, []).sort((left, right) =>
    right.savedAt.localeCompare(left.savedAt),
  );
}

export function toggleSavedDestination(destination: Omit<SavedDestinationMemory, "savedAt">): SavedDestinationMemory[] {
  const current = getSavedDestinations();
  const exists = current.some((item) => item.slug === destination.slug);
  const next = exists
    ? current.filter((item) => item.slug !== destination.slug)
    : [{ ...destination, savedAt: new Date().toISOString() }, ...current].slice(0, 12);

  writeJson(SAVED_DESTINATIONS_KEY, next);
  return next;
}
