// Editorial authorship for E-E-A-T.
//
// Google's 2026 guidance weights *Experience* most heavily: content needs a
// real, named human author with a bio and a stable author page — not just an
// "Organization" byline. This module is the single source of truth for that
// author identity, surfaced as (1) a visible byline on every guide/comparison/
// report and (2) a `Person` JSON-LD node linked to the site Organization.
//
// Photo intentionally omitted (owner's choice) — the byline + author page fall
// back to the author's initial. To add one later: drop a square image in
// /public and set `image: "/branding/<file>"`.

import { getSiteUrl } from "./site";

export interface Author {
  id: string;
  /** Display name shown in bylines. Use the real person's name. */
  name: string;
  /** Role / title, e.g. "Założyciel i redaktor naczelny". */
  role: string;
  /** 1-3 sentence honest bio. */
  bio: string;
  /** Path to the author page, e.g. "/redakcja". */
  url: string;
  /** Optional real photo URL under /public. Omit rather than fake. */
  image?: string;
  /** External profiles that corroborate the person (Facebook, LinkedIn…). */
  sameAs?: string[];
  /** Honest, verifiable experience bullets shown on the author page. */
  experience?: string[];
}

export const EDITOR_IN_CHIEF: Author = {
  id: "jakub-ogrodniczuk",
  name: "Jakub Ogrodniczuk",
  role: "Założyciel i redaktor HelpTravel",
  bio:
    "Pasjonat branży turystycznej z wieloletnim doświadczeniem. W HelpTravel łączy realne ceny hoteli, " +
    "czasy lotów z polskich lotnisk i wieloletnie średnie pogodowe w jedną, prostą decyzję wyjazdową — " +
    "bez marketingowego lania wody.",
  url: "/redakcja",
  sameAs: ["https://www.facebook.com/jakub.ogrodniczuk.9"],
  experience: [
    "Analizuje ceny hoteli i lotów dla ponad 235 kierunków osiągalnych z Polski.",
    "Każdy przewodnik i porównanie opiera na realnych danych dostawców (LiteAPI) i wieloletnich średnich klimatycznych — nie na ogólnikach.",
    "Tworzy serwis zgodnie z jawnym modelem afiliacyjnym: planowanie jest darmowe, płacisz wyłącznie u partnera rezerwacyjnego.",
  ],
};

export const authors: Author[] = [EDITOR_IN_CHIEF];

export const defaultAuthor = EDITOR_IN_CHIEF;

export function getAuthorById(id: string): Author {
  return authors.find((a) => a.id === id) ?? EDITOR_IN_CHIEF;
}

// `Person` JSON-LD node linked to the site Organization via `worksFor`.
// This is the canonical, Google-attributable way to express authorship.
// Use as `author` on Article schema (publisher stays the Organization).
export function personSchema(author: Author = defaultAuthor) {
  const siteUrl = getSiteUrl();
  return {
    "@type": "Person",
    "@id": `${siteUrl}${author.url}#person`,
    name: author.name,
    jobTitle: author.role,
    description: author.bio,
    url: `${siteUrl}${author.url}`,
    ...(author.image ? { image: `${siteUrl}${author.image}` } : {}),
    ...(author.sameAs && author.sameAs.length ? { sameAs: author.sameAs } : {}),
    worksFor: { "@id": `${siteUrl}/#organization` },
  };
}
