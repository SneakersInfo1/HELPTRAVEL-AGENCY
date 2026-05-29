"use client";

// Fire-once GA4 event beacon for server-rendered pages.
//
// Most of our SEO pages (commercial landing, hotel detail, destination
// guides) are server components, so they can't call the client-only
// `track()` directly. Drop this tiny client component into the page tree
// with the event + params and it fires exactly once on mount.
//
//   <TrackView event="landing_view" params={{ city_slug: "barcelona" }} />
//
// No visual output. Safe with consent gating (track() no-ops when gtag
// isn't loaded). StrictMode double-invoke is guarded by a ref so we never
// double-count in dev.

import { useEffect, useRef } from "react";

import { track, type TrackEventMap, type TrackEventName } from "@/lib/analytics/track";

export function TrackView<E extends TrackEventName>({
  event,
  params,
}: {
  event: E;
  params: TrackEventMap[E];
}) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    track(event, params);
    // params is intentionally not in deps — we fire once per mount with the
    // initial params. Re-firing on param identity change would double-count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
