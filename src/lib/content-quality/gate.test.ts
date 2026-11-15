// Testy Anti-AI-Slop Quality Gate.
//
// Korpus pozytywny to PRAWDZIWE dokumenty z content/seo (zweryfikowane
// w źródłach) — na nich mierzymy fałszywe alarmy. Każdy przypadek negatywny
// to ten sam dobry dokument z jedną wstrzykniętą wadą, więc test pokazuje, że
// reguła łapie dokładnie tę wadę, a nie coś przy okazji.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CONTENT_DOCUMENTS } from "../../../content/seo/index.generated";
import { computeContentHash } from "@/lib/content-engine/hash";
import { ContentDocumentSchema, type ContentDocument } from "@/lib/content-engine/schema";
import { buildSiteInventory } from "@/lib/content-engine/site-inventory";
import { makeDocument } from "@/lib/content-engine/test-helpers";

import { FILLER_PHRASES, publishDecision, runQualityGate, type GateContext, type GateReport } from "./gate";

const NOW = new Date("2026-11-20T12:00:00Z");
const inventory = buildSiteInventory();
const ctx: GateContext = {
  now: NOW,
  existing: inventory.existing(),
  isKnownRoute: (route) => inventory.isKnownRoute(route.split("?")[0]),
};

const corpus: ContentDocument[] = CONTENT_DOCUMENTS.map((raw) => ContentDocumentSchema.parse(raw));
const good = (): ContentDocument => structuredClone(corpus.find((doc) => doc.id === "athens-greece-vs-rome-italy")!);

/** Dokument po zmianie treści dostaje nowy hash — inaczej test sprawdzałby niespójny rekord. */
function mutate(change: (doc: ContentDocument) => void): ContentDocument {
  const doc = good();
  change(doc);
  doc.contentHash = computeContentHash(doc);
  return doc;
}

function firstProse(doc: ContentDocument) {
  const section = doc.sections.find((s) => s.kind === "prose");
  assert.ok(section && section.kind === "prose");
  return section;
}

const rules = (report: GateReport) => report.findings.filter((f) => f.severity !== "info").map((f) => f.rule);

describe("korpus pozytywny — fałszywe alarmy", () => {
  it("cztery zweryfikowane dokumenty: zero zastrzeżeń blokujących", () => {
    assert.equal(corpus.length >= 4, true);
    let falsePositives = 0;
    for (const doc of corpus) {
      const report = runQualityGate(doc, ctx);
      const blocking = report.findings.filter((f) => f.severity === "block_facts" || f.severity === "revise" || f.severity === "skip");
      if (blocking.length > 0) falsePositives += 1;
      assert.deepEqual(blocking, [], `${doc.id}: ${blocking.map((f) => `${f.rule}: ${f.message}`).join(" | ")}`);
    }
    // Wskaźnik fałszywych alarmów na korpusie pozytywnym: 0 z N (mierzony, nie deklarowany).
    assert.equal(falsePositives, 0);
  });

  it("dokument EVERGREEN przechodzi jako PASS, DYNAMIC jako REVIEW_REQUIRED", () => {
    for (const doc of corpus) {
      const report = runQualityGate(doc, ctx);
      assert.equal(report.verdict, doc.riskClass === "EVERGREEN" ? "PASS" : "REVIEW_REQUIRED", doc.id);
    }
  });

  it("naturalny polski tekst z liczebnikami bez jednostek nie jest brany za fakt liczbowy", () => {
    const doc = mutate((d) => {
      firstProse(d).paragraphs.push("Na oba miasta wystarczą 3 albo 4 dni, a plan dla 2 osób układa się podobnie jak dla większej grupy znajomych.");
    });
    assert.equal(runQualityGate(doc, ctx).verdict, "PASS");
  });
});

describe("fakty i źródła", () => {
  it("liczba z jednostką bez pokrycia w twierdzeniu → BLOCKED_FACTS", () => {
    const doc = mutate((d) => {
      firstProse(d).paragraphs.push("W lipcu temperatura w Atenach sięga 34°C, a w Rzymie jest wyraźnie chłodniej i przyjemniej.");
    });
    const report = runQualityGate(doc, ctx);
    assert.equal(report.verdict, "BLOCKED_FACTS");
    assert.ok(rules(report).includes("number_without_claim"));
    assert.match(report.findings.find((f) => f.rule === "number_without_claim")!.evidence ?? "", /34°C/);
  });

  it("twierdzenie użyte w tekście, ale niepotwierdzone w źródle → BLOCKED_FACTS", () => {
    const doc = mutate((d) => {
      d.factClaims[0].verification = "unverified";
    });
    const report = runQualityGate(doc, ctx);
    assert.equal(report.verdict, "BLOCKED_FACTS");
    assert.ok(rules(report).includes("claim_unverified"));
  });

  it("twierdzenie po terminie ważności (TTL klasy danych) → BLOCKED_FACTS", () => {
    const doc = mutate((d) => {
      d.factClaims[0].dataClass = "opening_hours";
      d.factClaims[0].riskClass = "DYNAMIC";
      d.riskClass = "DYNAMIC";
      d.factClaims[0].retrievedAt = "2026-07-01T10:00:00Z"; // 142 dni przed NOW, TTL 90
    });
    const report = runQualityGate(doc, ctx);
    assert.equal(report.verdict, "BLOCKED_FACTS");
    assert.ok(rules(report).includes("claim_expired"));
  });

  it("niezweryfikowane albo przeterminowane twierdzenie nie pokrywa liczby w tekście", () => {
    for (const state of ["unverified", "expired"] as const) {
      const doc = mutate((d) => {
        const claim = d.factClaims[0];
        claim.claim = "Trasa spacerowa ma 3 km długości";
        claim.value = "3 km";
        claim.observedEvidence = "The walking route is 3 km long.";
        if (state === "unverified") claim.verification = "unverified";
        else {
          claim.dataClass = "opening_hours";
          claim.riskClass = "DYNAMIC";
          claim.retrievedAt = "2026-01-01T10:00:00Z";
          d.riskClass = "DYNAMIC";
        }
        const prose = firstProse(d);
        if (!prose.claimIds.includes(claim.id)) prose.claimIds.push(claim.id);
        prose.paragraphs.push("Trasa spacerowa ma 3 km długości i prowadzi przez zwartą część historycznego centrum.");
      });
      assert.ok(rules(runQualityGate(doc, ctx)).includes("number_without_claim"), state);
    }
  });

  it("kwota bez twierdzenia cenowego → BLOCKED_FACTS (pozorowana cena)", () => {
    const doc = mutate((d) => {
      firstProse(d).paragraphs.push("Hotele w centrum Aten kosztują od 250 zł za noc, więc wyjazd zamkniesz w rozsądnym budżecie.");
    });
    const report = runQualityGate(doc, ctx);
    assert.equal(report.verdict, "BLOCKED_FACTS");
    assert.ok(rules(report).includes("price_without_source"));
  });

  it("wiza i dokumenty bez źródła urzędowego → BLOCKED_FACTS; ze źródłem → REVIEW_REQUIRED", () => {
    const withoutSource = mutate((d) => {
      firstProse(d).paragraphs.push("Do Grecji i Włoch polski turysta wjeżdża bez wizy, wystarczy dowód osobisty albo paszport.");
    });
    const blocked = runQualityGate(withoutSource, ctx);
    assert.equal(blocked.verdict, "BLOCKED_FACTS");
    assert.ok(rules(blocked).includes("high_risk_without_source"));

    const withSource = mutate((d) => {
      firstProse(d).paragraphs.push("Do Grecji i Włoch polski turysta wjeżdża bez wizy, wystarczy dowód osobisty albo paszport.");
      d.sources.push({ id: "msz", url: "https://www.gov.pl/web/dyplomacja/grecja", title: "Grecja — informacje dla podróżujących", publisher: "MSZ", kind: "government", licence: "Informacja publiczna", retrievedAt: "2026-11-19T10:00:00Z" });
      d.factClaims.push({ id: "wjazd", claim: "Obywatele Polski wjeżdżają do Grecji na podstawie dowodu osobistego lub paszportu", value: "", dataClass: "entry_requirements", riskClass: "HIGH_RISK", sourceId: "msz", observedEvidence: "dowód osobisty lub paszport", retrievedAt: "2026-11-19T10:00:00Z", verification: "source_verified" });
      d.riskClass = "HIGH_RISK";
    });
    const review = runQualityGate(withSource, ctx);
    assert.equal(review.verdict, "REVIEW_REQUIRED");
    // Nawet w trybie automatycznym treść wysokiego ryzyka nie jest publikowana bez człowieka.
    assert.equal(publishDecision(review, withSource, "AUTO_EVERGREEN"), "REVIEW_REQUIRED");
  });

  it("rok z przyszłości bez twierdzenia → BLOCKED_FACTS", () => {
    const doc = mutate((d) => {
      firstProse(d).paragraphs.push("W sezonie 2027 oba miasta przygotowują nowe trasy zwiedzania dla gości z Polski.");
    });
    const report = runQualityGate(doc, ctx);
    assert.equal(report.verdict, "BLOCKED_FACTS");
    assert.ok(rules(report).includes("future_year_without_source"));
  });

  it("tabela bez przypisanych twierdzeń → BLOCKED_FACTS", () => {
    const doc = mutate((d) => {
      d.sections.find((s) => s.kind === "table")!.claimIds = [];
    });
    assert.ok(rules(runQualityGate(doc, ctx)).includes("section_without_claims"));
  });

  it("brak zweryfikowanego materiału → SKIPPED_QUALITY_GATE (cron nie musi nic wydać)", () => {
    const doc = mutate((d) => {
      for (const claim of d.factClaims) claim.verification = "unverified";
    });
    const report = runQualityGate(doc, ctx);
    assert.equal(report.verdict, "SKIPPED_QUALITY_GATE");
    assert.equal(publishDecision(report, doc, "AUTO_EVERGREEN"), "SKIPPED_QUALITY_GATE");
  });

  it("źródło spoza allowlisty blokuje dokument; własne dane wymagają jawnego rodzaju", () => {
    const blocked = mutate((d) => {
      d.sources[0].url = "https://example.com/fakty";
    });
    assert.ok(rules(runQualityGate(blocked, ctx)).includes("source_not_allowed"));

    const own = mutate((d) => {
      d.sources[0].url = "https://helptravel.pl/dane/metodologia";
      d.sources[0].kind = "own_data";
    });
    assert.ok(!rules(runQualityGate(own, ctx)).includes("source_not_allowed"));
  });
});

describe("jakość redakcyjna", () => {
  it("zmyślone doświadczenie autora → NEEDS_REVISION", () => {
    const doc = mutate((d) => {
      firstProse(d).paragraphs.push("Byliśmy w Atenach w maju i z własnego doświadczenia polecamy zacząć dzień od porannej kawy pod wzgórzem.");
    });
    const report = runQualityGate(doc, ctx);
    assert.equal(report.verdict, "NEEDS_REVISION");
    assert.ok(rules(report).includes("fake_experience"));
  });

  it("fałszywa presja i obietnica ceny → NEEDS_REVISION", () => {
    const doc = mutate((d) => {
      firstProse(d).paragraphs.push("Rezerwuj teraz, bo zostały ostatnie pokoje w tym terminie, a taka okazja szybko się nie powtórzy.");
    });
    assert.ok(rules(runQualityGate(doc, ctx)).includes("fake_urgency"));
  });

  it("frazy-wypełniacze → NEEDS_REVISION z listą trafień", () => {
    const doc = mutate((d) => {
      firstProse(d).paragraphs.push("Nie da się ukryć, że Ateny to prawdziwa perełka, a malownicze uliczki tętniące życiem gwarantują niezapomniane wrażenia.");
    });
    const report = runQualityGate(doc, ctx);
    assert.equal(report.verdict, "NEEDS_REVISION");
    assert.ok(report.metrics.fillerHits >= 3);
    assert.ok(rules(report).includes("filler_phrases"));
  });

  it("lead, który nie odpowiada na intencję → NEEDS_REVISION", () => {
    const doc = mutate((d) => {
      d.title = "Europejskie stolice na krótki wyjazd — przegląd";
      d.lead = "Europa ma wiele miast, które dobrze sprawdzają się na krótki wyjazd. Poniżej zebraliśmy kilka uwag o planowaniu podróży i wyborze terminu dla osób lecących z Polski.";
    });
    assert.ok(rules(runQualityGate(doc, ctx)).includes("lead_misses_intent"));
  });

  it("to samo zdanie dwa razy → NEEDS_REVISION", () => {
    const doc = mutate((d) => {
      const prose = firstProse(d);
      prose.paragraphs.push(prose.paragraphs[0]);
    });
    assert.ok(rules(runQualityGate(doc, ctx)).includes("repeated_sentence"));
  });

  it("tytuł skopiowany z innej strony serwisu → NEEDS_REVISION (kanibalizacja)", () => {
    const other = ctx.existing.find((item) => item.canonicalUrl === "/wyjazdy/city-break")!;
    const doc = mutate((d) => {
      d.title = other.title;
    });
    assert.ok(rules(runQualityGate(doc, ctx)).includes("duplicate_title"));
  });

  it("lead przepisany z istniejącego huba → NEEDS_REVISION", () => {
    const other = ctx.existing.find((item) => item.canonicalUrl === "/wyjazdy/plaza")!;
    const doc = mutate((d) => {
      d.lead = other.lead!;
    });
    assert.ok(rules(runQualityGate(doc, ctx)).includes("duplicate_intro"));
  });

  it("za krótki tekst dla typu treści → NEEDS_REVISION", () => {
    const doc = mutate((d) => {
      d.sections = d.sections.filter((s) => s.kind === "table");
    });
    assert.ok(rules(runQualityGate(doc, ctx)).includes("too_short_for_type"));
  });

  it("znacznik HTML w dowolnym polu tekstowym → NEEDS_REVISION", () => {
    const doc = mutate((d) => {
      firstProse(d).paragraphs.push("Opis pozostaje tekstem, ale zawiera <strong>niedozwolony znacznik</strong> przekazany dalej do strony.");
    });
    const report = runQualityGate(doc, ctx);
    assert.equal(report.verdict, "NEEDS_REVISION");
    assert.ok(rules(report).includes("html_markup_in_text"));
  });
});

describe("sekcje faktograficzne i opinie", () => {
  it("prose/list bez twierdzeń wymaga opinion:true", () => {
    const factual = makeDocument();
    const section = factual.sections[0];
    assert.equal(section.kind, "prose");
    section.claimIds = [];
    assert.equal(ContentDocumentSchema.safeParse(factual).success, false);

    if (section.kind === "prose") section.opinion = true;
    assert.equal(ContentDocumentSchema.safeParse(factual).success, true);
  });

  it("sekcja-opinia nie może zawierać liczby z jednostką", () => {
    const doc = makeDocument();
    const section = doc.sections[0];
    assert.equal(section.kind, "prose");
    section.claimIds = [];
    if (section.kind === "prose") {
      section.opinion = true;
      section.paragraphs.push("Moim zdaniem odcinek 3 km jest najlepszym wariantem spokojnego spaceru po mieście.");
    }
    assert.equal(ContentDocumentSchema.safeParse(doc).success, false);
  });
});

describe("linki, adresy i daty", () => {
  it("CTA do nieistniejącej trasy i do kroku zakupu → NEEDS_REVISION", () => {
    const missing = mutate((d) => {
      d.ctaTarget = "/hotele/najlepsze-oferty";
    });
    assert.ok(rules(runQualityGate(missing, ctx)).includes("cta_invalid"));
    const purchase = mutate((d) => {
      d.ctaTarget = "/hotele/rezerwacja";
    });
    assert.ok(rules(runQualityGate(purchase, ctx)).includes("cta_invalid"));
  });

  it("link wewnętrzny do nieistniejącej strony → NEEDS_REVISION", () => {
    const doc = mutate((d) => {
      d.relatedContent.push("/kierunki/atlantyda");
    });
    assert.ok(rules(runQualityGate(doc, ctx)).includes("related_link_invalid"));
  });

  it("nowy artykuł pod istniejącym adresem albo z mniej niż 3 linkami → NEEDS_REVISION", () => {
    const collision = mutate((d) => {
      d.contentType = "article";
      d.canonicalUrl = "/inspiracje/tanie-city-breaki-na-weekend";
    });
    assert.ok(rules(runQualityGate(collision, ctx)).includes("url_collision"));
    const fewLinks = mutate((d) => {
      d.contentType = "article";
      d.canonicalUrl = "/inspiracje/ateny-czy-rzym-na-city-break";
      d.relatedContent = ["/porownanie"];
    });
    assert.ok(rules(runQualityGate(fewLinks, ctx)).includes("internal_links_plan"));
  });

  it("data modyfikacji zmieniona bez zmiany treści → NEEDS_REVISION", () => {
    const doc = good();
    const report = runQualityGate({ ...doc, materiallyModifiedAt: "2026-11-19T08:00:00Z" }, { ...ctx, previous: { contentHash: doc.contentHash, materiallyModifiedAt: doc.materiallyModifiedAt, publishedAt: doc.publishedAt } });
    assert.ok(rules(report).includes("date_modified_without_change"));
  });

  it("daty z przyszłości → NEEDS_REVISION", () => {
    const doc = good();
    assert.ok(rules(runQualityGate({ ...doc, verifiedAt: "2026-12-24T00:00:00Z" }, ctx)).includes("date_integrity"));
  });

  it("dokument niezgodny ze schematem → NEEDS_REVISION z listą pól", () => {
    const report = runQualityGate({ id: "x", title: "za krótki" }, ctx);
    assert.equal(report.verdict, "NEEDS_REVISION");
    assert.ok(report.findings.every((f) => f.rule === "schema_invalid"));
    assert.ok(report.findings.length > 3);
  });
});

describe("polityka publikacji", () => {
  const pass = runQualityGate(good(), ctx);

  it("PASS + EVERGREEN publikuje się automatycznie tylko w trybie AUTO_EVERGREEN", () => {
    assert.equal(pass.verdict, "PASS");
    assert.equal(publishDecision(pass, { riskClass: "EVERGREEN" }, "AUTO_EVERGREEN"), "APPROVED_AUTOMATION");
    assert.equal(publishDecision(pass, { riskClass: "EVERGREEN" }, "DRAFT_AND_PR"), "REVIEW_REQUIRED");
    assert.equal(publishDecision(pass, { riskClass: "EVERGREEN" }, "DRY_RUN"), "REVIEW_REQUIRED");
  });

  it("PASS przy klasie DYNAMIC albo HIGH_RISK nigdy nie jest automatyczny", () => {
    assert.equal(publishDecision(pass, { riskClass: "DYNAMIC" }, "AUTO_EVERGREEN"), "REVIEW_REQUIRED");
    assert.equal(publishDecision(pass, { riskClass: "HIGH_RISK" }, "AUTO_EVERGREEN"), "REVIEW_REQUIRED");
  });

  it("BLOCKED_FACTS i NEEDS_REVISION dają REJECTED w każdym trybie", () => {
    for (const verdict of ["BLOCKED_FACTS", "NEEDS_REVISION"] as const) {
      for (const mode of ["DRY_RUN", "DRAFT_AND_PR", "AUTO_EVERGREEN"] as const) {
        assert.equal(publishDecision({ ...pass, verdict }, { riskClass: "EVERGREEN" }, mode), "REJECTED");
      }
    }
  });
});

describe("słownik wypełniaczy", () => {
  it("frazy są małymi literami i bez duplikatów (dopasowanie jest po znormalizowanym tekście)", () => {
    assert.equal(new Set(FILLER_PHRASES).size, FILLER_PHRASES.length);
    for (const phrase of FILLER_PHRASES) assert.equal(phrase, phrase.toLowerCase());
  });
});

describe("regresje z przeglądu 2026-11-14", () => {
  const addParagraph = (text: string) => mutate((d) => firstProse(d).paragraphs.push(text));

  it("liczba porównywana po wartości: „9 h” nie jest pokryta rokiem 1987", () => {
    const report = runQualityGate(addParagraph("Lot z Polski do Aten trwa 9 h, więc na krótki wyjazd to daleko."), ctx);
    assert.ok(rules(report).includes("number_without_claim"));
  });

  it("jednostki pisane słownie i inne waluty wymagają twierdzenia", () => {
    for (const text of [
      "Od lotniska do centrum jest 8 kilometrów, dojazd zajmuje chwilę.",
      "Miasto ma średnio 300 dni słońca w roku i łagodny klimat.",
      "Bilet wstępu do muzeum kosztuje 450 koron za osobę dorosłą.",
    ]) {
      assert.equal(runQualityGate(addParagraph(text), ctx).verdict, "BLOCKED_FACTS", text);
    }
  });

  it("krótki okres planu („3 albo 4 dni”) i liczby bez jednostki nie wymagają źródła", () => {
    const report = runQualityGate(addParagraph("Na oba miasta wystarczą 3 albo 4 dni, a pierwszy dzień warto zostawić na spokojny spacer."), ctx);
    assert.equal(report.verdict, "PASS");
  });

  it("twierdzenie „zweryfikowane” musi mieć swoje liczby w cytacie źródła", () => {
    const doc = mutate((d) => {
      d.factClaims[0].claim = "Lotnisko leży 60 km od centrum Aten";
      d.factClaims[0].value = "60 km";
      d.factClaims[0].observedEvidence = "Athens International Airport";
    });
    const report = runQualityGate(doc, ctx);
    assert.equal(report.verdict, "BLOCKED_FACTS");
    assert.ok(rules(report).includes("claim_number_not_in_evidence"));
  });

  it("zapis tysięcy z angielskiego źródła („3,718 m”) pokrywa twierdzenie „3718 m”", () => {
    const doc = mutate((d) => {
      d.factClaims[0].claim = "Szczyt ma 3718 m wysokości";
      d.factClaims[0].value = "3718 m";
      d.factClaims[0].observedEvidence = "at 3,718 m, is the highest peak on Spanish soil";
    });
    assert.ok(!rules(runQualityGate(doc, ctx)).includes("claim_number_not_in_evidence"));
  });

  it("ta sama liczba z innym wymiarem nie potwierdza twierdzenia", () => {
    const doc = mutate((d) => {
      d.factClaims[0].claim = "Dojazd trwa 3 godziny";
      d.factClaims[0].value = "3 godziny";
      d.factClaims[0].observedEvidence = "The route is 3 km long";
    });
    assert.ok(rules(runQualityGate(doc, ctx)).includes("claim_number_not_in_evidence"));
  });

  it("brak identyfikatora alfanumerycznego w cytacie blokuje twierdzenie", () => {
    const doc = mutate((d) => {
      d.factClaims[0].claim = "Szlak PR6 prowadzi przez dolinę";
      d.factClaims[0].value = "PR6";
      d.factClaims[0].observedEvidence = "Official route PR1 crosses the valley";
    });
    assert.ok(rules(runQualityGate(doc, ctx)).includes("claim_identifier_not_in_evidence"));
  });

  it("odmiana „wiza” i „bezwizowy” to temat wysokiego ryzyka; „wizyta” nie", () => {
    for (const text of [
      "Przed wyjazdem musisz mieć wizę wydaną przez konsulat tego kraju.",
      "Do tego kraju polecisz z wizą elektroniczną wyrobioną wcześniej.",
      "Obowiązuje tam ruch bezwizowy dla obywateli Unii Europejskiej.",
    ]) {
      const found = rules(runQualityGate(addParagraph(text), ctx));
      assert.ok(found.includes("high_risk_without_source"), text);
    }
    const visit = rules(runQualityGate(addParagraph("Wizyta w muzeum archeologicznym zajmuje zwykle pół dnia, warto zacząć rano."), ctx));
    assert.ok(!visit.includes("high_risk_without_source"));
  });

  it("„jedno z ostatnich miejsc na wybrzeżu” to opis, nie fałszywa presja", () => {
    const report = runQualityGate(addParagraph("To jedno z ostatnich miejsc na wybrzeżu, gdzie stare kamienice stoją tuż przy porcie."), ctx);
    assert.ok(!rules(report).includes("fake_urgency"));
  });
});
