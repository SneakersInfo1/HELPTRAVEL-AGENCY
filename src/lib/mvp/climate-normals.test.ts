import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { getAllDestinationProfiles } from "./destinations";
import { formatClimateNumber, formatClimatePeriod, getClimateNormal } from "./climate-normals";

// Plik powstaje skryptem `pnpm seo:climate` z WMO WWIS. Strony formatują te
// wartości bez dodatkowych sprawdzeń, więc każde odświeżenie musi przejść tę kontrolę.
const file = JSON.parse(readFileSync("src/lib/mvp/climate-normals.generated.json", "utf8")) as {
  source: string;
  sourceUrl: string;
  terms: string;
  retrievedAt: string;
  normals: Array<Record<string, unknown> & { slug: string }>;
};
const profileSlugs = new Set(getAllDestinationProfiles().map((profile) => profile.slug));
const isMonthly = (value: unknown, allowNull: boolean) =>
  Array.isArray(value) && value.length === 12 && value.every((item) => (allowNull && item === null) || (typeof item === "number" && Number.isFinite(item)));

describe("plik norm klimatycznych WMO", () => {
  it("ma nagłówek źródła, warunki użycia i datę pobrania", () => {
    assert.equal(file.source, "WMO World Weather Information Service");
    assert.equal(file.sourceUrl, "https://worldweather.wmo.int");
    assert.match(file.terms, /^https:\/\/worldweather\.wmo\.int\//);
    assert.match(file.retrievedAt, /^\d{4}-\d{2}-\d{2}$/);
  });

  it("każda norma jest kompletna, spójna i wskazuje istniejący kierunek", () => {
    const seen = new Set<string>();
    for (const normal of file.normals) {
      const where = normal.slug;
      assert.ok(profileSlugs.has(normal.slug), `${where}: nieznany kierunek`);
      assert.ok(!seen.has(normal.slug), `${where}: duplikat`);
      seen.add(normal.slug);
      assert.ok(isMonthly(normal.maxTempC, false), `${where}: maxTempC`);
      assert.ok(isMonthly(normal.minTempC, false), `${where}: minTempC`);
      assert.ok(isMonthly(normal.rainfallMm, false), `${where}: rainfallMm`);
      assert.ok(isMonthly(normal.rainDays, true), `${where}: rainDays`);
      const max = normal.maxTempC as number[];
      const min = normal.minTempC as number[];
      max.forEach((value, index) => {
        assert.ok(value >= min[index], `${where} m${index + 1}: maksimum niższe od minimum`);
        assert.ok(value <= 50 && min[index] >= -50, `${where} m${index + 1}: poza zakresem`);
      });
      for (const value of normal.rainfallMm as number[]) assert.ok(value >= 0 && value <= 1500, `${where}: opad`);
      for (const value of normal.rainDays as Array<number | null>) if (value !== null) assert.ok(value >= 0 && value <= 31, `${where}: dni z opadem`);
      assert.match(String(normal.sourceUrl), /^https:\/\/worldweather\.wmo\.int\/en\/city\.html\?cityId=\d+$/, `${where}: adres źródła`);
      assert.ok(typeof normal.provider === "string" && normal.provider.trim().length > 2, `${where}: służba`);
      // Stacja bywa niepodana przez źródło; wtedy musi być nazwa miasta WWIS do etykiety.
      assert.ok(normal.stationName === null || (typeof normal.stationName === "string" && normal.stationName.trim().length > 1), `${where}: stacja`);
      assert.ok(typeof normal.wwisCity === "string" && normal.wwisCity.trim().length > 1, `${where}: miasto WWIS`);
      assert.ok(typeof normal.latitude === "number" && Math.abs(normal.latitude) <= 90, `${where}: szerokość`);
      assert.ok(typeof normal.longitude === "number" && Math.abs(normal.longitude) <= 180, `${where}: długość`);
      if (normal.periodFrom !== null || normal.periodTo !== null) {
        assert.ok(typeof normal.periodFrom === "number" && typeof normal.periodTo === "number" && normal.periodFrom <= normal.periodTo, `${where}: okres`);
      }
    }
    assert.ok(file.normals.length >= 180, `norm: ${file.normals.length}`);
  });

  it("wartości wychodzą na stronę wiernie: jedno miejsce po przecinku, bez zaokrąglania do pełnych stopni", () => {
    assert.equal(formatClimateNumber(13.6), "13,6");
    assert.equal(formatClimateNumber(28), "28,0");
    assert.equal(formatClimatePeriod(1981, 2010), "norma 1981–2010");
    assert.equal(formatClimatePeriod(null, null), "okres normy niepodany przez źródło");
    assert.equal(getClimateNormal("barcelona-spain")?.maxTempC[0], 13.6);
    assert.equal(getClimateNormal("kierunek-bez-normy"), null);
  });
});
