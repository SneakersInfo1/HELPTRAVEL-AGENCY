import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { auditHtml, countWords, decodeEntities, shingleSimilarity } from "./html-audit";

const PAGE = `<!DOCTYPE html><html lang="pl"><head>
<title>Ateny czy Rzym? Porównanie | HelpTravel</title>
<meta name="description" content="Ateny czy Rzym: plaże &amp; zwiedzanie."/>
<meta name="robots" content="index, follow"/>
<link rel="canonical" href="https://helptravel.pl/porownanie/athens-greece-vs-rome-italy"/>
<meta property="og:title" content="Ateny vs Rzym"/>
<meta property="og:image" content="https://helptravel.pl/og.png"/>
<meta name="twitter:title" content="Ateny czy Rzym?"/>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Article","headline":"x"},{"@type":["FAQPage","WebPage"]}]}</script>
</head><body>
<header><a href="/">Start</a><svg><title>Logo</title></svg></header>
<main>
<h1>Ateny czy <!-- -->Rzym<!-- -->? Porównanie</h1>
<h2>Tabela różnic</h2>
<p>Zwiedzanie i&nbsp;plaże — krótko.</p>
<script>window.__x = "to nie jest treść strony";</script>
<a href="/kierunki/athens-greece#hotele">Ateny</a>
<a href="https://helptravel.pl/kierunki/rome-italy?x=1">Rzym</a>
<a href="https://example.com/">zewn.</a>
<a href="mailto:kontakt@example.com">mail</a>
<img src="/a.jpg" alt="Akropol"/><img src="/b.jpg"/>
</main></body></html>`;

describe("auditHtml", () => {
  const audit = auditHtml(PAGE, "https://helptravel.pl/porownanie/athens-greece-vs-rome-italy");

  it("czyta metadane z <head> i dekoduje encje", () => {
    assert.equal(audit.lang, "pl");
    assert.deepEqual(audit.titles, ["Ateny czy Rzym? Porównanie | HelpTravel"]);
    assert.equal(audit.titleInHead, true);
    assert.equal(audit.metaDescription, "Ateny czy Rzym: plaże & zwiedzanie.");
    assert.equal(audit.metaRobots, "index, follow");
    assert.deepEqual(audit.canonicals, ["https://helptravel.pl/porownanie/athens-greece-vs-rome-italy"]);
    assert.equal(audit.canonicalInHead, true);
    assert.equal(audit.ogTitle, "Ateny vs Rzym");
    assert.equal(audit.twitterTitle, "Ateny czy Rzym?");
  });

  it("tytuł grafiki SVG nie jest tytułem dokumentu", () => {
    assert.equal(audit.titles.length, 1);
  });

  it("komentarze-separatory Reacta nie wstawiają spacji w nagłówek", () => {
    assert.deepEqual(audit.h1, ["Ateny czy Rzym? Porównanie"]);
    assert.deepEqual(audit.h2, ["Tabela różnic"]);
  });

  it("zbiera typy JSON-LD z @graph i tablic @type", () => {
    assert.deepEqual(audit.jsonLd[0].types.sort(), ["Article", "FAQPage", "WebPage"]);
    assert.equal(audit.jsonLdErrors, 0);
  });

  it("liczy słowa treści bez skryptów i rozdziela linki wewnętrzne od zewnętrznych", () => {
    assert.ok(!audit.mainText.includes("to nie jest treść"));
    assert.ok(audit.mainText.includes("Zwiedzanie i plaże"));
    assert.deepEqual(audit.internalLinks, ["/", "/kierunki/athens-greece", "/kierunki/rome-italy?x=1"]);
    assert.equal(audit.externalLinkCount, 1);
    assert.equal(audit.imageCount, 2);
    assert.equal(audit.imagesWithoutAlt, 1);
  });

  it("zepsuty JSON-LD jest liczony jako błąd, a nie wywraca audytu", () => {
    const broken = auditHtml('<html><head><script type="application/ld+json">{nie json</script></head><body><main></main></body></html>', "https://helptravel.pl/");
    assert.equal(broken.jsonLdErrors, 1);
    assert.equal(broken.mainWordCount, 0);
    assert.equal(broken.titleInHead, false);
  });

  it("strona bez <main> ma zero słów treści — treść tylko po stronie klienta jest widoczna jako brak", () => {
    const clientOnly = auditHtml('<html lang="pl"><head><title>X</title></head><body><div id="root"></div></body></html>', "https://helptravel.pl/x");
    assert.equal(clientOnly.mainWordCount, 0);
    assert.deepEqual(clientOnly.h1, []);
  });
});

describe("narzędzia tekstowe", () => {
  it("decodeEntities obsługuje nazwane, dziesiętne i szesnastkowe", () => {
    assert.equal(decodeEntities("a&amp;b &#243; &#xF3; &nieznana;"), "a&b ó ó &nieznana;");
  });

  it("countWords pomija samą interpunkcję", () => {
    assert.equal(countWords("Ateny — czy Rzym ? 3 dni"), 5);
    assert.equal(countWords(""), 0);
  });

  it("shingleSimilarity: identyczne 1, rozłączne 0, szablon z podmienioną nazwą wysoko", () => {
    const a = "Alicante w maju hotele z cenami w PLN i loty na ten termin sprawdź dostępność w wyszukiwarce";
    const b = "Walencja w maju hotele z cenami w PLN i loty na ten termin sprawdź dostępność w wyszukiwarce";
    assert.equal(shingleSimilarity(a, a), 1);
    assert.equal(shingleSimilarity(a, "zupełnie inne zdanie o czymś innym niż tamto"), 0);
    assert.ok(shingleSimilarity(a, b) > 0.8);
    assert.equal(shingleSimilarity("", a), 0);
  });
});
