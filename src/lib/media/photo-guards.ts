// Strażnicy zdjęć kierunków — czyste funkcje (bez sieci), wspólne dla resolvera
// i testów.

import { localizeCityPl, localizeCountryPl } from "@/lib/mvp/destination-i18n";

/** Usuwa znaki diakrytyczne, zachowuje wielkość liter (nazwy własne są z wielkiej). */
function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Nazwy, pod którymi opis zdjęcia może podać kraj. Regiony i wyspy tylko wtedy,
 * gdy jednoznacznie leżą w tym kraju (Wyspy Kanaryjskie, Madera, Kreta).
 */
const COUNTRY_ALIASES: Readonly<Record<string, readonly string[]>> = {
  "United Kingdom": ["UK", "England", "Scotland", "Wales", "Northern Ireland", "Britain", "Great Britain"],
  "United States of America": ["USA", "United States", "America", "California", "Florida", "Nevada", "Illinois", "Massachusetts", "Hawaii", "Texas", "NYC"],
  Czechia: ["Czech Republic", "Czech"],
  Turkey: ["Turkiye"],
  Netherlands: ["Holland"],
  "United Arab Emirates": ["UAE", "Emirates"],
  "Bosnia and Herzegovina": ["Bosnia"],
  "North Macedonia": ["Macedonia"],
  "South Korea": ["Korea"],
  Spain: ["Canary Islands", "Balearic Islands", "Mallorca", "Majorca", "Ibiza", "Gran Canaria", "Tenerife", "Lanzarote", "Fuerteventura", "Andalusia", "Catalonia"],
  Portugal: ["Madeira", "Azores", "Algarve"],
  Italy: ["Sicily", "Sardinia", "Tuscany", "Amalfi Coast"],
  Greece: ["Crete", "Corfu", "Rhodes", "Santorini", "Mykonos", "Zakynthos"],
  Croatia: ["Dalmatia", "Istria"],
  Indonesia: ["Bali"],
  Tanzania: ["Zanzibar"],
};

/**
 * Nazwy miast, które są też zwykłymi słowami albo początkiem innych nazw
 * („a nice view”, „male traveler”, „Porto Santo” na Maderze, „Faro de Trafalgar”).
 * Dla nich nazwa nie może otwierać opisu ani stać przed kolejnym słowem z wielkiej litery.
 */
const AMBIGUOUS_CITY_NAMES = new Set(["Nice", "Male", "Split", "Bar", "Cork", "Faro", "Porto", "Palma", "Sofia", "Florence", "Victoria", "Santiago", "Kos", "Bled", "Pula"]);

function wholeWord(name: string): RegExp {
  return new RegExp(`(^|[^\\p{L}])(${escapeRegExp(name)})(?=[^\\p{L}]|$)`, "gu");
}

function mentionsCity(alt: string, name: string): boolean {
  for (const match of alt.matchAll(wholeWord(name))) {
    if (!AMBIGUOUS_CITY_NAMES.has(name)) return true;
    const start = (match.index ?? 0) + match[1].length;
    const before = alt.slice(0, start).trim();
    const after = alt.slice(start + name.length);
    const sentenceStart = before === "" || /[.!?]$/.test(before);
    const partOfLongerName = /^\s+\p{Lu}/u.test(after);
    if (!sentenceStart && !partOfLongerName) return true;
  }
  return false;
}

/**
 * Zdjęcie z wyszukiwania przechodzi tylko wtedy, gdy jego opis w Pexels wymienia
 * TO miasto (nazwa własna, po angielsku albo po polsku) ORAZ jego kraj. Sama
 * trafność zapytania nie wystarcza: wyszukiwarka zwraca też ładne zdjęcia innych
 * miejsc (na „Rhodes Greece” — Stare Miasto na Korfu), a strona nigdy nie może
 * podpisać obcego miasta nazwą kierunku. Kraj odsiewa miasta o tej samej nazwie
 * (Valencia w Wenezueli) i zbieżności ze zwykłymi słowami.
 */
export function photoDescribesDestination(alt: string, destination: { city: string; country: string }): boolean {
  const text = stripDiacritics(alt);
  if (!text) return false;

  const cityNames = new Set([destination.city, localizeCityPl(destination.city)].map(stripDiacritics).filter((name) => name.length >= 3));
  for (const name of [...cityNames]) {
    const words = name.split(/\s+/).filter(Boolean);
    // „Santa Cruz de Tenerife” → opis „Tenerife” też jest tym kierunkiem.
    if (words.length >= 3 && words[words.length - 1].length >= 5) cityNames.add(words[words.length - 1]);
  }
  if (![...cityNames].some((name) => mentionsCity(text, name))) return false;

  // Alias kraju równy nazwie miasta niczego nie potwierdza („Rhodes” jako Grecja dla Rodos).
  const countryNames = [destination.country, localizeCountryPl(destination.country), ...(COUNTRY_ALIASES[destination.country] ?? [])]
    .map(stripDiacritics)
    .filter((name) => name.length >= 2 && !cityNames.has(name));
  return countryNames.some((name) => wholeWord(name).test(text));
}

/**
 * Wyszukiwanie Pexels na żywo tylko na produkcji (albo jawnie lokalnie:
 * PEXELS_LIVE_SEARCH=1). Buildy Preview i lokalne nie zużywają limitu wspólnego
 * klucza — kilka Preview w godzinie odbierało limit produkcji (19.11.2026).
 */
export function liveSearchAllowed(env: Record<string, string | undefined>): boolean {
  if (!env.PEXELS_API_KEY) return false;
  return env.VERCEL_ENV === "production" || env.PEXELS_LIVE_SEARCH === "1";
}
