// Boty, które dostają metadane (title, canonical, robots) BLOKUJĄCO w <head>,
// a nie strumieniowane później do <body>.
//
// Next 16 strumieniuje metadane stron z asynchronicznym `generateMetadata`.
// Googlebot jest u Next botem „renderującym JS", więc też dostawał canonical
// dopiero w <body> — zmierzone na produkcji na stronie hotelu z datami:
// `</head>` na bajcie 2923, canonical na 43150. Google honoruje rel=canonical
// wyłącznie w <head>.
//
// `htmlLimitedBots` ZASTĘPUJE domyślną listę Next, więc kopiujemy ją w całości
// i dopisujemy Googlebota oraz crawlery wyszukiwarek AI (nie wykonują JS).
// Test porównuje kopię z listą zainstalowanego Next: aktualizacja, która ją
// zmieni, wywróci test, zamiast po cichu zgubić boty.
//
// Koszt: te boty czekają na pełne metadane przed pierwszym bajtem (dłuższy
// TTFB tylko dla nich). Strony statyczne nie są objęte — tam metadane są
// rozwiązane w buildzie.

/** Domyślna lista z next/dist/shared/lib/router/utils/html-bots.js (Next 16.2.9). */
export const NEXT_DEFAULT_HTML_LIMITED_BOTS =
  "[\\w-]+-Google|Google-[\\w-]+|Chrome-Lighthouse|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|Yeti|googleweblight";

const SEARCH_AND_AI_CRAWLERS = [
  "Googlebot",
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
];

export const HTML_LIMITED_BOTS = new RegExp(
  `${NEXT_DEFAULT_HTML_LIMITED_BOTS}|${SEARCH_AND_AI_CRAWLERS.join("|")}`,
  "i",
);
