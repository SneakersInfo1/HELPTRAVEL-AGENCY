# HelpTravel data sources plan

## Goal
Keep the product honest: the planner can inspire, rank and redirect, but the final source of truth for offers should come from live travel inventory whenever possible.

## Source priority

### Current affiliate routing
#### CJ
- Hotels.com
- Expedia
- Vrbo
- Hotels.com Poland
- CheapTickets
- Orbitz
- LOT Global

#### Travelpayouts
- Aviasales
- Kiwi.com
- Klook
- Tiqets
- Kiwitaxi
- Localrent
- GetRentacar
- Yesim

#### Fallback
- Google search / Google Hotels / Google Flights style redirects
- Booking search fallback for stay discovery when no direct inventory is available
- Manual routing when no live partner feed exists

### Flights
1. Duffel as the main live inventory layer.
2. Travelpayouts as affiliate fallback.
3. SerpApi or Apify only for research and enrichment.

### Stays
1. Booking Demand API as the live stay layer.
2. CJ for hotel redirects.
3. Travelpayouts for supporting travel verticals.

### Activities
1. Travelpayouts for tours and add-ons.
2. SerpApi or Apify for discovery signals.

### Transfers
1. Direct partner APIs.
2. Travelpayouts fallback.
3. Manual routing if no feed exists.

## Rollout order
1. Keep the current planner and UX stable.
2. Add a shared data-source strategy layer in code.
3. Wire live inventory source by source.
4. Keep enrichment separate from final bookable inventory.
5. Use redirects only when inventory is unavailable.

## Rules
- Do not mix enrichment and inventory in the same UI contract.
- Do not show scraped data as if it were a confirmed offer.
- Do not introduce new partner claims without a live source.
- Keep the fallback path visible and honest.

## Related code
- [`src/lib/mvp/data-sources.ts`](../src/lib/mvp/data-sources.ts)
