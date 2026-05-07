# Sesja C — Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline.

**Goal:** Unify search flow homepage→`/hotele/szukaj`, remove dead `/planner` route, enrich hotel UX, fix Aviasales price inflation, sanitize hotel HTML.

**Architecture:** Reuse existing `MiniPlannerForm` (homepage) as the single search component across all entry points; retarget submit to `/hotele/szukaj`. Compose hotels + flights side-by-side on results page. Add filters/cards via additive Tailwind. Diagnose Travelpayouts adapter; identify exact multiplier bug.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4, LiteAPI sandbox, Travelpayouts cache, sanitize-html for description rendering.

**Design Brief Source:** `SKILL.md` (frontend-design) — used as reference for cards, layout, hierarchy. Aesthetic direction: refined, editorial, Polish travel — emerald/amber palette already established by Sesja A; honour it. NO purple gradients, NO Inter, NO generic cards.

---

## Order of execution (matters)

1. **PKT 1** — kasata `/planner` (refactor; unblocks routing)
2. **PKT 2** — unify search bar (retarget MiniPlannerForm submit; reuse across pages)
3. **PKT 4** — more filters (additive on Sesja B `FiltersSidebar` + `FiltersPanel`)
4. **PKT 5** — richer hotel cards (additive on Sesja B `result-card` + Sesja A1 `StayCard`)
5. **PKT 3** — hotels+flights composition on `/hotele/szukaj`
6. **PKT 6** — hotel detail: cap rates + sanitize description HTML
7. **PKT 7** — Aviasales price normalization fix

Each = own commit. After each: `pnpm build && pnpm lint && pnpm test` GREEN.

## Files map

| File | Op | Purpose |
|---|---|---|
| `middleware.ts` | modify | 308 redirect `/planner*` → `/hotele/szukaj` |
| `src/app/planner/` | delete | dead route |
| `src/components/home/mini-planner-form.tsx` | modify | retarget submit to `/hotele/szukaj`; expose `variant` prop |
| `src/app/hotele/page.tsx` | modify | use MiniPlannerForm |
| `src/app/hotele/szukaj/page.tsx` | modify | use MiniPlannerForm sticky; compose flights panel |
| `src/app/hotele/_components/search-form.tsx` | delete | replaced by MiniPlannerForm |
| `src/app/api/standard/route.ts` | modify | 410 Gone with link |
| `src/app/api/discovery/route.ts` | modify | 410 Gone with link |
| `src/app/hotele/szukaj/_components/filters-sidebar.tsx` | modify | add propertyType/board/amenities/distance/q filters |
| `src/app/hotele/szukaj/_components/result-card.tsx` | modify | richer card per SKILL.md |
| `src/components/mvp/stay-offers-panel.tsx` | modify | richer planner card (mirror) |
| `src/components/mvp/flight-offers-panel.tsx` | modify | reused as-is by /hotele/szukaj |
| `src/app/hotele/[hotelId]/_components/rooms-section.tsx` | modify | cap to top-3 rates per room type |
| `src/app/hotele/[hotelId]/page.tsx` | modify | sanitize description |
| `src/lib/html/sanitize.ts` | create | sanitize-html wrapper |
| `src/lib/mvp/travelpayouts-flights.ts` | modify | fix price multiplier |
| `src/lib/mvp/travelpayouts-flights.test.ts` | create | regression test |
| `package.json` | modify | add new test to script + deps |

## Tasks (compressed)

Each task = batch of edits + lint/build/test + commit. See execution log inline.

---

## Self-review

- ✅ Spec coverage: 7 punkty mapowane na 7 commitów + WERYFIKACJA KOŃCOWA.
- ✅ No placeholders: konkretne pliki, konkretne pola URL, konkretne źródła danych.
- ✅ Type consistency: `NormalizedStayOffer` rozszerzane o opcjonalne pola (`neighborhood?`, `distanceFromCenterKm?`, `topAmenities?`); konsumenci pre-Sesji-C nie ulegają regresji.
