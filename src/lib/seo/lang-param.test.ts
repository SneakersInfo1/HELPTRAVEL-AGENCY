import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { stripLangParam } from "./lang-param";

// Test B: `?lang=` nie może tworzyć drugiej, indeksowalnej wersji adresu.
// Serwis nie ma wersji angielskiej, a `/?lang=en` pojawiał się w wynikach
// Google (audyt SEO Growth V1, pkt 4).
describe("stripLangParam — ?lang nie tworzy osobnego adresu (test B)", () => {
  it("usuwa ?lang=en ze strony głównej", () => {
    assert.equal(stripLangParam("https://helptravel.pl/?lang=en"), "https://helptravel.pl/");
  });

  it("zostawia pozostałe parametry w tej samej kolejności", () => {
    assert.equal(
      stripLangParam("https://helptravel.pl/kierunki/malaga-spain?utm_source=tiktok&lang=en&tab=loty"),
      "https://helptravel.pl/kierunki/malaga-spain?utm_source=tiktok&tab=loty",
    );
  });

  it("usuwa każdą wartość lang — także pl, pustą i powtórzoną", () => {
    assert.equal(stripLangParam("https://helptravel.pl/faq?lang=pl"), "https://helptravel.pl/faq");
    assert.equal(stripLangParam("https://helptravel.pl/faq?lang="), "https://helptravel.pl/faq");
    assert.equal(stripLangParam("https://helptravel.pl/faq?lang=en&lang=de"), "https://helptravel.pl/faq");
  });

  it("zwraca null, gdy nie ma czego przekierować", () => {
    assert.equal(stripLangParam("https://helptravel.pl/kierunki?utm_source=x"), null);
    assert.equal(stripLangParam("https://helptravel.pl/?language=en"), null);
  });
});
