// Walidacja JSON-LD dla typów, które serwis faktycznie emituje: Organization,
// WebSite, BreadcrumbList, Article/BlogPosting, ItemList, FAQPage i Offer
// oraz TouristAttraction, żeby pseudo-encje z tagów nie wróciły (PR #1.5).
//
// To nie jest pełny walidator schema.org — sprawdza warunki, które audyt
// SEO Growth V1 zastał złamane albo które Google wymaga do wyników
// rozszerzonych: adresy bezwzględne, ciągła numeracja list, nagłówek bez
// minionego roku i Offer wyłącznie z realną ceną na przyszły termin.
// Używają go testy jednostkowe builderów i test E2E na Preview.

export interface JsonLdIssue {
  type: string;
  message: string;
}

type JsonLdNode = Record<string, unknown>;

/** Wszystkie obiekty z `@type`, także zagnieżdżone (np. Offer w Hotel). */
export function collectJsonLdNodes(data: unknown): JsonLdNode[] {
  const nodes: JsonLdNode[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    const node = value as JsonLdNode;
    if (node["@type"] !== undefined) nodes.push(node);
    Object.values(node).forEach(visit);
  };
  visit(data);
  return nodes;
}

function typesOf(node: JsonLdNode): string[] {
  const type = node["@type"];
  if (typeof type === "string") return [type];
  return Array.isArray(type) ? type.filter((item): item is string => typeof item === "string") : [];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isAbsoluteUrl(value: unknown): boolean {
  return typeof value === "string" && /^https?:\/\/[^\s/]+/.test(value);
}

/** Pełny węzeł, a nie samo odwołanie `{ "@type", "@id", name }`. */
function hasOwnFields(node: JsonLdNode): boolean {
  return Object.entries(node).some(([key, value]) => value !== undefined && !["@type", "@id", "name"].includes(key));
}

function listElements(node: JsonLdNode): unknown[] | null {
  return Array.isArray(node.itemListElement) ? node.itemListElement : null;
}

function checkPositions(type: string, elements: unknown[], issues: JsonLdIssue[]) {
  elements.forEach((element, index) => {
    const position = (element as JsonLdNode | null)?.position;
    if (position !== index + 1) {
      issues.push({ type, message: `element ${index + 1} ma position ${String(position)}, oczekiwano ${index + 1}` });
    }
  });
}

function validateOrganization(node: JsonLdNode, issues: JsonLdIssue[]) {
  if (!hasOwnFields(node)) return;
  if (!isNonEmptyString(node.name)) issues.push({ type: "Organization", message: "brak name" });
  if (!isAbsoluteUrl(node.url)) issues.push({ type: "Organization", message: "url nie jest adresem bezwzględnym" });
  const logo = node.logo;
  const logoUrl = typeof logo === "string" ? logo : (logo as JsonLdNode | undefined)?.url;
  if (!isAbsoluteUrl(logoUrl)) issues.push({ type: "Organization", message: "brak logo z adresem bezwzględnym" });
}

function validateWebSite(node: JsonLdNode, issues: JsonLdIssue[]) {
  if (!isNonEmptyString(node.name)) issues.push({ type: "WebSite", message: "brak name" });
  if (!isAbsoluteUrl(node.url)) issues.push({ type: "WebSite", message: "url nie jest adresem bezwzględnym" });
  // Serwis ma jedną wersję językową — deklaracja kilku języków zapowiada treść, której nie ma.
  if (node.inLanguage !== "pl-PL") {
    issues.push({ type: "WebSite", message: `inLanguage ${JSON.stringify(node.inLanguage)} zamiast "pl-PL"` });
  }
}

function validateBreadcrumbs(node: JsonLdNode, issues: JsonLdIssue[]) {
  const elements = listElements(node);
  if (!elements || elements.length === 0) {
    issues.push({ type: "BreadcrumbList", message: "pusta lista" });
    return;
  }
  checkPositions("BreadcrumbList", elements, issues);
  elements.forEach((element, index) => {
    const item = element as JsonLdNode;
    if (!isNonEmptyString(item?.name)) issues.push({ type: "BreadcrumbList", message: `element ${index + 1} bez name` });
    const target = typeof item?.item === "string" ? item.item : (item?.item as JsonLdNode | undefined)?.["@id"];
    if (!isAbsoluteUrl(target)) {
      issues.push({ type: "BreadcrumbList", message: `element ${index + 1} ma adres ${JSON.stringify(target)}, a nie bezwzględny` });
    }
  });
}

function validateArticle(type: string, node: JsonLdNode, currentYear: number, issues: JsonLdIssue[]) {
  const headline = node.headline;
  if (!isNonEmptyString(headline)) {
    issues.push({ type, message: "brak headline" });
  } else {
    if (headline.length > 110) issues.push({ type, message: `headline ma ${headline.length} znaków (limit 110)` });
    const pastYears = (headline.match(/\b20\d{2}\b/g) ?? []).map(Number).filter((year) => year < currentYear);
    if (pastYears.length > 0) issues.push({ type, message: `headline z minionym rokiem: ${headline}` });
  }
  if (!node.author) issues.push({ type, message: "brak author" });
  if (!node.publisher) issues.push({ type, message: "brak publisher" });
  if (node.datePublished !== undefined && Number.isNaN(Date.parse(String(node.datePublished)))) {
    issues.push({ type, message: `datePublished nie jest datą: ${String(node.datePublished)}` });
  }
}

function validateItemList(node: JsonLdNode, issues: JsonLdIssue[]) {
  const elements = listElements(node);
  if (!elements || elements.length === 0) {
    issues.push({ type: "ItemList", message: "pusta lista" });
    return;
  }
  checkPositions("ItemList", elements, issues);
}

function validateFaqPage(node: JsonLdNode, issues: JsonLdIssue[]) {
  const questions = Array.isArray(node.mainEntity) ? node.mainEntity : [];
  if (questions.length === 0) {
    issues.push({ type: "FAQPage", message: "pusta lista pytań" });
    return;
  }
  questions.forEach((entry, index) => {
    const question = entry as JsonLdNode | null;
    const answer = question?.acceptedAnswer as JsonLdNode | undefined;
    if (!isNonEmptyString(question?.name) || !isNonEmptyString(answer?.text)) {
      issues.push({ type: "FAQPage", message: `pytanie ${index + 1} bez treści albo bez odpowiedzi` });
    }
  });
}

/**
 * TouristAttraction to konkretne miejsce. Sama nazwa bez adresu, współrzędnych
 * albo odnośnika to tag udający encję — audyt Faza 2.2 zastał 726 takich węzłów
 * („spokojniejszy pobyt", „zwiedzanie") na 235 przewodnikach.
 */
function validateTouristAttraction(node: JsonLdNode, issues: JsonLdIssue[]) {
  if (!isNonEmptyString(node.name)) issues.push({ type: "TouristAttraction", message: "brak name" });
  const hasLocator = Boolean(node.address || node.geo || node.sameAs) || isAbsoluteUrl(node.url);
  if (!hasLocator) {
    issues.push({
      type: "TouristAttraction",
      message: `${JSON.stringify(node.name)} bez adresu, współrzędnych ani odnośnika — to nie jest konkretne miejsce`,
    });
  }
}

function validateOffer(node: JsonLdNode, todayIso: string, issues: JsonLdIssue[]) {
  const price = typeof node.price === "string" ? Number(node.price) : node.price;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
    issues.push({ type: "Offer", message: `cena ${JSON.stringify(node.price)} nie jest kwotą większą od zera` });
  }
  if (typeof node.priceCurrency !== "string" || !/^[A-Z]{3}$/.test(node.priceCurrency)) {
    issues.push({ type: "Offer", message: `priceCurrency ${JSON.stringify(node.priceCurrency)} nie jest kodem ISO 4217` });
  }
  if (typeof node.availability !== "string" || !/^https?:\/\/schema\.org\//.test(node.availability)) {
    issues.push({ type: "Offer", message: `availability ${JSON.stringify(node.availability)} nie jest adresem schema.org` });
  }
  if (!isAbsoluteUrl(node.url)) issues.push({ type: "Offer", message: "url oferty nie jest adresem bezwzględnym" });
  // Oferta noclegu: validFrom to data zameldowania. Termin z przeszłości = oferta, której nie da się kupić.
  for (const field of ["validFrom", "priceValidUntil"] as const) {
    const value = node[field];
    if (value !== undefined && String(value).slice(0, 10) < todayIso) {
      issues.push({ type: "Offer", message: `${field} ${String(value)} jest przed ${todayIso}` });
    }
  }
}

export function validateJsonLd(data: unknown, options: { todayIso: string }): JsonLdIssue[] {
  const issues: JsonLdIssue[] = [];
  const currentYear = Number(options.todayIso.slice(0, 4));
  for (const node of collectJsonLdNodes(data)) {
    for (const type of typesOf(node)) {
      switch (type) {
        case "Organization":
          validateOrganization(node, issues);
          break;
        case "WebSite":
          validateWebSite(node, issues);
          break;
        case "BreadcrumbList":
          validateBreadcrumbs(node, issues);
          break;
        case "Article":
        case "BlogPosting":
          validateArticle(type, node, currentYear, issues);
          break;
        case "ItemList":
          validateItemList(node, issues);
          break;
        case "FAQPage":
          validateFaqPage(node, issues);
          break;
        case "TouristAttraction":
          validateTouristAttraction(node, issues);
          break;
        case "Offer":
          validateOffer(node, options.todayIso, issues);
          break;
      }
    }
  }
  return issues;
}
