import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { deflateRawSync } from "node:zlib";

import { parseGscCsv } from "@/lib/seo-ops/gsc/csv";

import { MAX_EXPORT_ZIP_BYTES, findGscExports, gscFreshness, loadGscExport, readZipEntries, toFiveColumnCsv } from "./gsc-export";

// Minimalny zapis ZIP (deflate) do testów — ten sam format, który oddaje eksport GSC.
function zip(files: Record<string, string | Buffer>, modified: Date, options: { stored?: readonly string[] } = {}): Buffer {
  const dosTime = (modified.getHours() << 11) | (modified.getMinutes() << 5) | Math.floor(modified.getSeconds() / 2);
  const dosDate = ((modified.getFullYear() - 1980) << 9) | ((modified.getMonth() + 1) << 5) | modified.getDate();
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = typeof content === "string" ? Buffer.from(content, "utf8") : content;
    const stored = options.stored?.includes(name) ?? false;
    const compressed = stored ? data : deflateRawSync(data);
    const method = stored ? 0 : 8;
    const nameBuffer = Buffer.from(name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    locals.push(local, nameBuffer, compressed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuffer);
    offset += 30 + nameBuffer.length + compressed.length;
  }
  const centralBuffer = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuffer, end]);
}

const PAGES_COMPARISON = [
  "Najpopularniejsze strony,Ostatnie 3 miesiące Kliknięcia,Poprzednie 3 miesiące Kliknięcia,Ostatnie 3 miesiące Wyświetlenia,Poprzednie 3 miesiące Wyświetlenia,Ostatnie 3 miesiące CTR,Poprzednie 3 miesiące CTR,Ostatnie 3 miesiące Pozycja,Poprzednie 3 miesiące Pozycja",
  "https://helptravel.pl/porownanie/a-vs-b,12,3,900,400,1.33%,0.75%,6.1,9.4",
].join("\n");
const QUERIES_PLAIN = ["Najpopularniejsze zapytania,Kliknięcia,Wyświetlenia,CTR,Pozycja", "a czy b,5,300,1.67%,5.2"].join("\n");

const root = mkdtempSync(path.join(os.tmpdir(), "gsc-export-test-"));
after(() => rmSync(root, { recursive: true, force: true }));

describe("eksporty GSC z interfejsu", () => {
  it("czyta ZIP z polskimi nazwami i znacznikiem czasu eksportu", () => {
    const buffer = zip({ "Strony.csv": PAGES_COMPARISON, "Zapytania.csv": QUERIES_PLAIN, "Filtry.csv": "Filtruj,Wartość\nData,Ostatnie 3 miesiące" }, new Date(2026, 10, 15, 13, 22, 10));
    const entries = readZipEntries(buffer);
    assert.deepEqual(entries.map((entry) => entry.name).sort(), ["Filtry.csv", "Strony.csv", "Zapytania.csv"]);
    assert.equal(entries[0].modifiedAt.getFullYear(), 2026);
    assert.equal(entries.find((entry) => entry.name === "Zapytania.csv")!.data().toString("utf8"), QUERIES_PLAIN);
  });

  it("tryb porównania okresów: bierze okres bieżący i daje 5 kolumn akceptowanych przez parser", () => {
    const { csv, comparison } = toFiveColumnCsv(PAGES_COMPARISON);
    assert.equal(comparison, true);
    const table = parseGscCsv(csv);
    assert.equal(table.rows.length, 1);
    assert.deepEqual(
      { clicks: table.rows[0].clicks, impressions: table.rows[0].impressions, position: table.rows[0].position },
      { clicks: 12, impressions: 900, position: 6.1 },
    );
    assert.ok(Math.abs(table.rows[0].ctr - 0.0133) < 1e-9);
    assert.equal(toFiveColumnCsv(QUERIES_PLAIN).comparison, false);
  });

  it("znajduje najnowszy eksport: dokładna data z Daty.csv wygrywa z szacunkiem", () => {
    const inbox = path.join(root, "inbox");
    mkdirSync(inbox, { recursive: true });
    writeFileSync(
      path.join(inbox, "stary.zip"),
      zip({ "Strony.csv": PAGES_COMPARISON, "Zapytania.csv": QUERIES_PLAIN }, new Date(2026, 8, 17, 13, 22, 0)),
    );
    writeFileSync(
      path.join(inbox, "nowy.zip"),
      zip(
        {
          "Pages.csv": "Top pages,Clicks,Impressions,CTR,Position\nhttps://helptravel.pl/x,1,10,10%,3",
          "Queries.csv": "Top queries,Clicks,Impressions,CTR,Position\nx,1,10,10%,3",
          "Dates.csv": "Date,Clicks,Impressions,CTR,Position\n2026-11-12,1,10,10%,3\n2026-11-14,1,10,10%,3",
        },
        new Date(2026, 10, 16, 9, 0, 0),
      ),
    );
    writeFileSync(path.join(inbox, "nie-gsc.zip"), zip({ "notatka.txt": "x" }, new Date(2026, 10, 16)));
    const found = findGscExports([inbox]);
    assert.equal(found.length, 2);
    assert.equal(path.basename(found[0].path), "nowy.zip");
    assert.equal(found[0].dataEnd, "2026-11-14");
    assert.equal(found[0].dataEndExact, true);
    assert.equal(path.basename(found[1].path), "stary.zip");
    assert.equal(found[1].dataEndExact, false);
    assert.equal(found[1].dataEnd, "2026-09-15");
    assert.equal(found[1].comparison, true);
  });

  it("obsługuje folder z plikami *pages*/*queries*/*daily* i wczytuje dane wyłącznie w pamięci", () => {
    const folder = path.join(root, "gsc", "2026-11-10");
    mkdirSync(folder, { recursive: true });
    writeFileSync(path.join(folder, "gsc_pages_top1000.csv"), "﻿Najpopularniejsze strony,Kliknięcia,Wyświetlenia,CTR,Pozycja\nhttps://helptravel.pl/,860,2437,0.3529,7.24");
    writeFileSync(path.join(folder, "gsc_queries_top1000.csv"), "Najpopularniejsze zapytania,Kliknięcia,Wyświetlenia,CTR,Pozycja\nhelptravel,5,10,0.5,1");
    writeFileSync(path.join(folder, "gsc_daily_2026-08-11_2026-11-10.csv"), "Data,Kliknięcia,Wyświetlenia,CTR,Pozycja\n2026-11-10,3,40,0.075,8");
    const old = new Date("2026-11-11T10:00:00Z");
    for (const name of ["gsc_pages_top1000.csv", "gsc_queries_top1000.csv", "gsc_daily_2026-08-11_2026-11-10.csv"]) utimesSync(path.join(folder, name), old, old);
    const [candidate] = findGscExports([path.join(root, "gsc")]);
    assert.equal(candidate.kind, "folder");
    assert.equal(candidate.dataEnd, "2026-11-10");
    const inputs = loadGscExport(candidate);
    assert.equal(parseGscCsv(inputs.pages).rows[0].clicks, 860);
    assert.equal(parseGscCsv(inputs.daily).rows.length, 1);
  });

  it("pomija archiwa większe niż limit eksportu (folder Pobrane bywa pełen dużych plików)", () => {
    const downloads = path.join(root, "pobrane");
    mkdirSync(downloads, { recursive: true });
    const valid = zip({ "Strony.csv": PAGES_COMPARISON, "Zapytania.csv": QUERIES_PLAIN }, new Date(2026, 10, 16, 9, 0, 0));
    writeFileSync(path.join(downloads, "eksport.zip"), valid);
    // Poprawny eksport GSC z dużym plikiem bez kompresji — bez limitu czytnik wczytałby całość i go przyjął.
    writeFileSync(
      path.join(downloads, "duze-archiwum.zip"),
      zip(
        { "film.bin": Buffer.alloc(MAX_EXPORT_ZIP_BYTES + 1), "Strony.csv": PAGES_COMPARISON, "Zapytania.csv": QUERIES_PLAIN },
        new Date(2026, 10, 16, 10, 0, 0),
        { stored: ["film.bin"] },
      ),
    );
    const found = findGscExports([downloads]);
    assert.deepEqual(found.map((candidate) => path.basename(candidate.path)), ["eksport.zip"]);
  });

  it("katalog wskazany wprost i ścieżka do ZIP są eksportem; przypadkowy pages.csv bez kolumn GSC nie jest", () => {
    const direct = path.join(root, "wprost");
    mkdirSync(direct, { recursive: true });
    writeFileSync(path.join(direct, "Strony.csv"), PAGES_COMPARISON);
    writeFileSync(path.join(direct, "Zapytania.csv"), QUERIES_PLAIN);
    assert.deepEqual(findGscExports([direct]).map((candidate) => candidate.path), [direct]);
    const zipPath = path.join(root, "wprost.zip");
    writeFileSync(zipPath, zip({ "Pages.csv": PAGES_COMPARISON, "Queries.csv": QUERIES_PLAIN }, new Date(2026, 10, 16, 9, 0, 0)));
    assert.deepEqual(findGscExports([zipPath]).map((candidate) => candidate.path), [zipPath]);
    const unrelated = path.join(root, "pobrane-inne");
    mkdirSync(unrelated, { recursive: true });
    writeFileSync(path.join(unrelated, "landing-pages-report.csv"), ["Page,Views,Bounce", "/a,10,0.5"].join("\n"));
    writeFileSync(path.join(unrelated, "queries-backup.csv"), ["Query,Count", "x,1"].join("\n"));
    assert.deepEqual(findGscExports([unrelated]), []);
  });

  it("ocenia świeżość danych: do 10 dni świeże, do 35 starzejące się, potem przestarzałe", () => {
    assert.deepEqual(gscFreshness("2026-11-14", "2026-11-17"), { ageDays: 3, verdict: "fresh" });
    assert.equal(gscFreshness("2026-11-07", "2026-11-17").verdict, "fresh");
    assert.equal(gscFreshness("2026-11-06", "2026-11-17").verdict, "aging");
    assert.equal(gscFreshness("2026-10-13", "2026-11-17").verdict, "aging");
    assert.equal(gscFreshness("2026-10-12", "2026-11-17").verdict, "stale");
  });
});
