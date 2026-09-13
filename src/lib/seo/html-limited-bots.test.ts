import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { HTML_LIMITED_BOT_UA_RE } from "next/dist/shared/lib/router/utils/html-bots";

import nextConfig from "../../../next.config";

import { HTML_LIMITED_BOTS, NEXT_DEFAULT_HTML_LIMITED_BOTS } from "./html-limited-bots";

const UA = {
  googlebotDesktop:
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/139.0.7258.127 Safari/537.36",
  googlebotSmartphone:
    "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.7258.127 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  gptBot: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot",
  claudeBot: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
  perplexityBot:
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
  bingbot:
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/116.0.1938.76 Safari/537.36",
  twitterbot: "Twitterbot/1.0",
  facebook: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  chromeDesktop:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
};

// Next buduje z konfiguracji `new RegExp(source, "i")` (server/lib/streaming-metadata.js),
// więc test sprawdza dokładnie ten obiekt, a nie flagi wpisane w pliku.
function blocksMetadata(userAgent: string): boolean {
  return new RegExp(HTML_LIMITED_BOTS.source, "i").test(userAgent);
}

describe("metadane w <head> dla crawlerów (test J)", () => {
  it("next.config ustawia własną listę botów", () => {
    assert.equal(nextConfig.htmlLimitedBots, HTML_LIMITED_BOTS);
  });

  it("Googlebot, desktop i smartfon, dostaje canonical, title i robots w <head>", () => {
    assert.equal(blocksMetadata(UA.googlebotDesktop), true);
    assert.equal(blocksMetadata(UA.googlebotSmartphone), true);
  });

  it("crawlery wyszukiwarek AI też dostają metadane w <head>", () => {
    assert.equal(blocksMetadata(UA.gptBot), true);
    assert.equal(blocksMetadata(UA.claudeBot), true);
    assert.equal(blocksMetadata(UA.perplexityBot), true);
  });

  it("zawiera całą domyślną listę Next, więc nadpisanie nie odbiera jej botom HTML", () => {
    assert.equal(NEXT_DEFAULT_HTML_LIMITED_BOTS, HTML_LIMITED_BOT_UA_RE.source);
    assert.equal(blocksMetadata(UA.bingbot), true);
    assert.equal(blocksMetadata(UA.twitterbot), true);
    assert.equal(blocksMetadata(UA.facebook), true);
  });

  it("zwykła przeglądarka nadal dostaje strumieniowanie", () => {
    assert.equal(blocksMetadata(UA.chromeDesktop), false);
    assert.equal(blocksMetadata(UA.chromeAndroid), false);
    assert.equal(blocksMetadata(UA.safariIphone), false);
  });
});
