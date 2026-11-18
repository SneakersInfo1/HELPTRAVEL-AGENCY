import { ContentDocumentSchema, type ContentDocument, type FactClaim } from "./schema";
import { computeContentHash } from "./hash";

export function makeClaim(overrides: Partial<FactClaim> = {}): FactClaim {
  return {
    id: "claim-1",
    claim: "Ogród miejski łączy centrum z zachodnią częścią miasta.",
    value: "Ogród miejski",
    dataClass: "geography",
    riskClass: "EVERGREEN",
    sourceId: "source-1",
    observedEvidence: "The city garden connects the centre with the western district.",
    retrievedAt: "2026-11-13T04:17:00.000Z",
    verification: "source_verified",
    ...overrides,
  };
}

export function makeDocument(overrides: Partial<ContentDocument> = {}): ContentDocument {
  const initial: ContentDocument = {
    id: "test-document",
    canonicalUrl: "/inspiracje/test-document",
    primaryQueryIntent: "miejski ogród spacer",
    contentType: "article",
    topicCluster: "miejski ogród",
    locale: "pl-PL",
    title: "Miejski ogród na spokojny spacer",
    description: "Praktyczny opis miejskiego ogrodu i trasy spacerowej oparty na zweryfikowanym źródle oficjalnym.",
    lead: "Miejski ogród pozwala ułożyć spokojny spacer od centrum do zachodniej części miasta i zachować czytelną orientację po drodze.",
    sections: [
      {
        id: "trasa-spaceru",
        kind: "prose",
        heading: "Czytelna trasa przez ogród",
        claimIds: ["claim-1"],
        paragraphs: [
          "Zielona oś prowadzi od zwartej zabudowy ku spokojniejszym ulicom i pozwala dobierać długość spaceru bez zmiany jego głównego kierunku.",
        ],
      },
    ],
    factClaims: [makeClaim()],
    sources: [
      {
        id: "source-1",
        url: "https://visitvalencia.com/test",
        title: "Oficjalny opis ogrodu",
        publisher: "Visit Valencia",
        kind: "official_tourism",
        licence: "Fakt i krótki cytat",
        retrievedAt: "2026-11-13T04:17:00.000Z",
      },
    ],
    imageAsset: { provider: "none", licence: "brak obrazu", alt: "", credit: "" },
    relatedContent: ["/kierunki/walencja", "/inspiracje", "/kierunki"],
    ctaTarget: "/kierunki",
    riskClass: "EVERGREEN",
    contentHash: "0".repeat(64),
    createdAt: "2026-11-13T04:17:00.000Z",
    publishedAt: null,
    materiallyModifiedAt: "2026-11-13T04:17:00.000Z",
    verifiedAt: "2026-11-13T04:17:00.000Z",
    owner: "HelpTravel SEO",
    reviewStatus: "draft",
    generationRunId: "test-run",
    aiDisclosure: "Treść przygotowano z pomocą AI i sprawdzono względem źródeł.",
    policyVersion: "test-policy",
    ...overrides,
  };
  return ContentDocumentSchema.parse({ ...initial, contentHash: computeContentHash(initial) });
}

