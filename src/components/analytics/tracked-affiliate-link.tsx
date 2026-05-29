"use client";

// Outbound affiliate link that fires a GA4 `affiliate_click` event before
// navigation. Used for Aviasales / Travelpayouts CTAs so we can attribute
// affiliate revenue back to the page/campaign that drove the click.
//
// Why a wrapper and not onClick on a plain <a>: the affiliate CTA lives in
// server components (AviasalesCta), which can't carry event handlers. This
// thin client component keeps the exact same anchor markup + rel/target
// semantics while adding the tracking call.
//
// We do NOT preventDefault / delay navigation — gtag's transport uses
// `navigator.sendBeacon` under the hood for events, which survives the
// page unload, so the click stays instant. (If you ever need guaranteed
// delivery before navigation, add `event_callback` + a short timeout — not
// worth the UX cost here.)

import type { ReactNode } from "react";

import { track } from "@/lib/analytics/track";

export function TrackedAffiliateLink({
  href,
  provider,
  destination,
  campaign,
  className,
  children,
}: {
  href: string;
  provider: "aviasales" | "hotellook" | "other";
  destination?: string;
  campaign?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener nofollow sponsored noreferrer"
      className={className}
      onClick={() => track("affiliate_click", { provider, destination, campaign })}
    >
      {children}
    </a>
  );
}
