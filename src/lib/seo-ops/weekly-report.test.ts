import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { GscRow } from "./gsc/csv";
import { buildWeeklyReport, NotConnectedGa4, positionBucket } from "./weekly-report";

function day(iso: string, clicks: number, impressions: number, position = 8): GscRow {
  return { key: iso, clicks, impressions, ctr: clicks / impressions, position };
}

function dailySeries(days: number, end: string): GscRow[] {
  const rows: GscRow[] = [];
  const endDate = new Date(`${end}T00:00:00Z`);
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(endDate);
    date.setUTCDate(date.getUTCDate() - i);
    // Pierwsza połowa: mniej wyświetleń, więcej kliknięć; druga odwrotnie.
    const firstHalf = i >= days / 2;
    rows.push(day(date.toISOString().slice(0, 10), firstHalf ? 10 : 4, firstHalf ? 100 : 400));
  }
  return rows;
}

describe("raport tygodniowy", () => {
  it("przedziały pozycji", () => {
    assert.equal(positionBucket(1), "1–3");
    assert.equal(positionBucket(3.2), "3–5");
    assert.equal(positionBucket(9.9), "5–10");
    assert.equal(positionBucket(17.8), "10–20");
    assert.equal(positionBucket(45), "20+");
  });

  it("liczy okna 28/56 dni, segmenty, markę i oznacza GA4 jako NOT_CONNECTED", async () => {
    const ga4 = new NotConnectedGa4();
    const report = buildWeeklyReport({
      daily: dailySeries(112, "2026-11-10"),
      pages: [
        { key: "https://helptravel.pl/porownanie/a-vs-b", clicks: 3, impressions: 900, ctr: 0.0033, position: 4.5 },
        { key: "https://helptravel.pl/kierunki/a/styczen", clicks: 1, impressions: 800, ctr: 0.0013, position: 9 },
      ],
      queries: [
        { key: "helptravel", clicks: 50, impressions: 60, ctr: 0.83, position: 1 },
        { key: "a czy b", clicks: 3, impressions: 300, ctr: 0.01, position: 4 },
      ],
      endDate: "2026-11-10",
      ga4: { status: ga4.status, rows: await ga4.organicLandingPages() },
    });
    assert.match(report, /\| 28 dni \(2026-10-14–2026-11-10 vs 2026-09-16–2026-10-13\) \| 112 → 112/);
    assert.match(report, /\| 56 dni \(2026-09-16–2026-11-10 vs 2026-07-22–2026-09-15\) \| 560 → 224/);
    assert.match(report, /\| comparison \| 1 \| 3 \| 900 \|/);
    assert.match(report, /Marka: 50 kliknięć/);
    assert.match(report, /NOT_CONNECTED/);
    assert.match(report, /dolne ograniczenie/);
  });

  it("niepełne okno jest nazwane, a nie liczone z dziur", () => {
    const report = buildWeeklyReport({
      daily: dailySeries(30, "2026-11-10"),
      pages: [],
      queries: [],
      endDate: "2026-11-10",
      ga4: { status: "NOT_CONNECTED", rows: [] },
    });
    assert.match(report, /\| 56 dni \| brak pełnych danych/);
  });
});
