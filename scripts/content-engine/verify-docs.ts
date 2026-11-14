// Weryfikacja dokumentów treści w content/seo — także tych pisanych ręcznie.
//
//   pnpm content:check                      offline: schemat, świeżość twierdzeń, bramka jakości
//   pnpm content:verify                     pobiera źródła i sprawdza każdy cytat (bez zapisu)
//   pnpm content:verify -- --write          zapisuje wynik weryfikacji, hash i indeks
//   pnpm content:verify -- --approve <id> --by "Imię Nazwisko" --write
//   pnpm content:verify -- --snapshots seo-private/sources/2026-11-13 --write
//
// `--snapshots <katalog>`: cytaty sprawdzane na zachowanej kopii strony (plik
// HTML nazwany adresem), z datą pobrania = datą pliku. Potrzebne, gdy źródło
// przestało odpowiadać automatom (np. test przeglądarki) — nie obchodzimy
// takiej ochrony, pracujemy na kopii pobranej wcześniej zwykłym żądaniem.
// Kopie zostają poza repo; w dokumencie zapisujemy ich sha256.
//
// O statusie `source_verified` decyduje WYŁĄCZNIE dosłowne znalezienie
// `observedEvidence` w tekście pobranego źródła. Skrypt nie woła żadnego
// modelu i nie dotyka niczego poza listą dozwolonych hostów źródeł.
//
// Kod wyjścia 1, gdy dokument o statusie `approved` nie przechodzi bramki
// (BLOCKED_FACTS / NEEDS_REVISION / SKIPPED) — to jest test treści dla CI.
//
// Świeżość twierdzeń:
//   --offline (pnpm content:check, część pnpm test) ocenia bramkę na dzień
//   ostatniej weryfikacji dokumentu, a wygasające twierdzenia tylko OSTRZEGA.
//   Inaczej `pnpm test` zaczynałby padać w konkretnym dniu bez zmiany kodu
//   (przegląd 2026-11-14). Strona i tak sama ukrywa dokument z wygasłym
//   twierdzeniem (site-content.ts), a pipeline wybiera go do odświeżenia.
//   --strict-freshness (pnpm content:freshness) — wygasłe twierdzenie = błąd.
//   --require-approved — dokument inny niż `approved` = błąd (sprawdzenie PR-ów:
//   merge propozycji z pipeline'u wymaga jawnego zatwierdzenia przez człowieka).

import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { runQualityGate, type GateReport } from "../../src/lib/content-quality/gate";
import { computeContentHash } from "../../src/lib/content-engine/hash";
import { claimExpiresAt, ContentDocumentSchema, type ContentDocument } from "../../src/lib/content-engine/schema";
import { buildSiteInventory } from "../../src/lib/content-engine/site-inventory";
import { HttpSourceFetcher, assertAllowedSource, evidenceFoundIn, htmlToText } from "../../src/lib/content-engine/sources";
import { ContentStore } from "../../src/lib/content-engine/store";

const FOLDERS = ["articles", "comparisons", "months", "hubs"] as const;

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function listFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  for (const folder of FOLDERS) {
    try {
      for (const name of (await readdir(path.join(root, folder))).sort()) {
        if (name.endsWith(".json")) files.push(path.join(root, folder, name));
      }
    } catch {
      // brak katalogu = brak dokumentów tego typu
    }
  }
  return files;
}

interface FetchedSource {
  text: string;
  status: number;
  retrievedAt: string;
  snapshotSha256?: string;
}

function snapshotName(url: string): string {
  return `${url.replace(/^https?:\/\//, "").replace(/[/?=&]/g, "_")}.html`;
}

async function readSnapshot(directory: string, url: string): Promise<FetchedSource | null> {
  assertAllowedSource(url);
  const file = path.join(directory, snapshotName(url));
  try {
    const [raw, info] = await Promise.all([readFile(file), stat(file)]);
    return {
      text: htmlToText(raw.toString("utf8")),
      status: 200,
      retrievedAt: info.mtime.toISOString(),
      snapshotSha256: createHash("sha256").update(raw).digest("hex"),
    };
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const root = option("store-dir") ?? "content/seo";
  const offline = flag("offline");
  const strictFreshness = flag("strict-freshness");
  const requireApproved = flag("require-approved");
  const write = flag("write");
  const approveId = option("approve");
  const approvedBy = option("by");
  if (approveId && !approvedBy) throw new Error("--approve wymaga --by \"Imię Nazwisko\" (zatwierdza człowiek)");

  const now = new Date();
  const nowIso = now.toISOString().replace(/\.\d+Z$/, "Z");
  const inventory = buildSiteInventory();
  const fetcher = new HttpSourceFetcher({ timeoutMs: 25_000 });
  const snapshots = option("snapshots");
  const sourceTexts = new Map<string, FetchedSource | null>();
  let failed = false;

  for (const file of await listFiles(root)) {
    const original = JSON.parse(await readFile(file, "utf8")) as unknown;
    const parsed = ContentDocumentSchema.safeParse(original);
    if (!parsed.success) {
      console.log(`✖ ${file}: schemat — ${parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
      failed = true;
      continue;
    }
    let doc: ContentDocument = parsed.data;
    const notes: string[] = [];

    if (!offline) {
      for (const source of doc.sources) {
        if (sourceTexts.has(source.url)) continue;
        try {
          const snapshot = snapshots ? await readSnapshot(snapshots, source.url) : null;
          if (snapshot) {
            sourceTexts.set(source.url, snapshot);
            continue;
          }
          const fetched: FetchedSource = await fetcher.fetchText(source.url);
          sourceTexts.set(source.url, fetched.status >= 200 && fetched.status < 300 ? fetched : null);
          if (fetched.status < 200 || fetched.status >= 300) notes.push(`źródło ${source.id}: HTTP ${fetched.status}`);
        } catch (error) {
          sourceTexts.set(source.url, null);
          notes.push(`źródło ${source.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      const sourceById = new Map(doc.sources.map((source) => [source.id, source]));
      const factClaims = doc.factClaims.map((claim) => {
        const source = sourceById.get(claim.sourceId);
        const fetched = source ? sourceTexts.get(source.url) : null;
        // Twierdzenie potwierdzone przez człowieka zostaje — automat go nie degraduje ani nie podbija.
        if (claim.verification === "human_verified") return claim;
        if (fetched && evidenceFoundIn(fetched.text, claim.observedEvidence)) {
          return { ...claim, verification: "source_verified" as const, retrievedAt: fetched.retrievedAt.replace(/\.\d+Z$/, "Z") };
        }
        notes.push(`twierdzenie ${claim.id}: cytatu nie znaleziono w źródle ${claim.sourceId}`);
        return { ...claim, verification: "unverified" as const };
      });
      const sources = doc.sources.map((source) => {
        const fetched = sourceTexts.get(source.url);
        if (!fetched) return source;
        return {
          ...source,
          retrievedAt: fetched.retrievedAt.replace(/\.\d+Z$/, "Z"),
          ...(fetched.snapshotSha256 ? { snapshotSha256: fetched.snapshotSha256 } : {}),
        };
      });
      const allVerified = factClaims.every((claim) => claim.verification !== "unverified");
      doc = { ...doc, factClaims, sources, verifiedAt: allVerified ? nowIso : doc.verifiedAt };
    }

    const contentHash = computeContentHash(doc);
    if (contentHash !== doc.contentHash) {
      // Materialna zmiana treści: tylko wtedy rusza się data modyfikacji.
      doc = { ...doc, contentHash, materiallyModifiedAt: /^0+$/.test(doc.contentHash) ? doc.createdAt : nowIso };
      notes.push("contentHash przeliczony (treść zmieniona)");
    }

    if (approveId === doc.id) {
      doc = { ...doc, reviewStatus: "approved", reviewedBy: approvedBy };
      notes.push(`status → approved (${approvedBy})`);
    }

    const checked = ContentDocumentSchema.parse(doc);
    // Bez --strict-freshness bramka liczy świeżość na dzień ostatniej weryfikacji.
    const gateNow = offline && !strictFreshness ? new Date(checked.verifiedAt) : now;
    const expiring = checked.factClaims
      .map((claim) => ({ id: claim.id, expiresAt: claimExpiresAt(claim) }))
      .filter((item) => item.expiresAt.getTime() - now.getTime() < 30 * 86_400_000);
    for (const item of expiring) {
      const expired = item.expiresAt.getTime() <= now.getTime();
      notes.push(`${expired ? "WYGASŁE" : "wygasa wkrótce"}: ${item.id} (${item.expiresAt.toISOString().slice(0, 10)}) — wymaga ponownej weryfikacji źródła`);
    }
    if (requireApproved && checked.reviewStatus !== "approved") {
      notes.push(`status ${checked.reviewStatus} — przed merge'em zatwierdź: pnpm content:verify -- --approve ${checked.id} --by "Imię Nazwisko" --write`);
      failed = true;
    }
    const report: GateReport = runQualityGate(checked, {
      now: gateNow,
      existing: inventory.existing(),
      isKnownRoute: (route) => inventory.isKnownRoute(route.split("?")[0]),
    });
    const blocking = report.verdict === "BLOCKED_FACTS" || report.verdict === "NEEDS_REVISION" || report.verdict === "SKIPPED_QUALITY_GATE";
    if (blocking && (checked.reviewStatus === "approved" || approveId === checked.id)) failed = true;

    console.log(`${blocking ? "✖" : "✔"} ${checked.id}  [${checked.reviewStatus}, ${checked.riskClass}]  bramka: ${report.verdict}  słów: ${report.metrics.words}  twierdzeń: ${report.metrics.verifiedClaims}/${report.metrics.claims}`);
    for (const note of notes) console.log(`    · ${note}`);
    for (const finding of report.findings) {
      if (finding.severity === "info") continue;
      console.log(`    ${finding.severity.toUpperCase()} ${finding.rule}${finding.location ? ` @${finding.location}` : ""}: ${finding.message}${finding.evidence ? ` — „${finding.evidence}"` : ""}`);
    }

    if (write && !(blocking && approveId === checked.id)) {
      await writeFile(file, `${JSON.stringify(checked, null, 2)}\n`, "utf8");
    }
  }

  if (write) {
    const index = await new ContentStore(root).regenerateIndex();
    console.log(`indeks: ${index}`);
  }
  if (failed) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
