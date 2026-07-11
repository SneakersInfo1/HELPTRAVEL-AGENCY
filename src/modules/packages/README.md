# Moduł domenowy: Pakiety Lot + Hotel

Osobny produkt (własne flow, orkiestracja płatności, ryzyko prawne), nie widget.
Spec: `PROMPT_PAKIETY_LOT_HOTEL.md`. Decyzje: `docs/PACKAGES_DECISIONS.md`.
Kontrakt LiteAPI: `docs/LITEAPI_FLIGHTS_CONTRACT.md`.

## Struktura (§3.1)

```
src/modules/packages/
  types.ts                     # PackageOffer, PackageSearchResult, PackageSagaState, PackageSessionState
  services/
    flightsClient.ts           # cienki re-export @/lib/flights (ZERO duplikacji kontraktu)
    packageSearch.ts           # orkiestracja hotele × loty (STUB → Faza 1)
    packagePricing.ts          # cena/os., delty, zaokrąglenia (STUB → Faza 1)
    packageOrchestrator.ts     # SAGA rezerwacji (STUB → Faza 2, po prawie)
  api/                         # route handlers app/api/packages/* (Faza 1)
  state/                       # sesja flow w Redis pkg-session:{uuid} (Faza 1)
  components/                  # UI kroków 1–4 + sidebar (Faza 1–2)
```

## Flaga
`NEXT_PUBLIC_FEATURE_PACKAGES` (off na prod, on na staging) — bez niej tab/wejścia niewidoczne.

## Status faz
- **Faza 0** ✅ — struktura + decyzje + kontrakt (ten commit).
- **Faza 1** — search + krok 1–2 + landingi SEO (noindex) + homepage tab + cache warming. Bez płatności.
- **Faza 2** — saga + dwa checkouty + webhooki. **Zablokowana do rozstrzygnięcia prawnego** (§0 pkt 1).

## Reużycie (nie duplikuj)
loty: `@/lib/flights/*` · hotele/cache/room-grouping: istniejący hotel-search · warming: `api/cron/warm-flights`
· translation layer nazw hoteli · fix montażu Payment SDK z flow hotelowego.
