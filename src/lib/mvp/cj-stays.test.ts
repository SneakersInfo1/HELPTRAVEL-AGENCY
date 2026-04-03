import assert from "node:assert/strict";
import test from "node:test";

import { buildCjStayLinks, getCjDestinationSeed } from "./cj-stays";

test("getCjDestinationSeed returns starter metadata for curated CJ city", () => {
  const seed = getCjDestinationSeed("Malaga", "Spain");

  assert.ok(seed);
  assert.equal(seed?.destinationLabel, "Malaga, Spain");
});

test("getCjDestinationSeed supports expanded starter list", () => {
  const seed = getCjDestinationSeed("London", "United Kingdom");

  assert.ok(seed);
  assert.equal(seed?.destinationLabel, "London, United Kingdom");
});

test("buildCjStayLinks generates wrapped Hotels.com, Expedia and Vrbo links", () => {
  process.env.CJ_HOTELS_COM_TEMPLATE = "https://example.com/hotels?redirect={urlEncoded}";
  process.env.CJ_EXPEDIA_TEMPLATE = "https://example.com/expedia?redirect={urlEncoded}";
  process.env.CJ_VRBO_TEMPLATE = "https://example.com/vrbo?redirect={urlEncoded}";

  const links = buildCjStayLinks("Barcelona", "Spain");

  assert.ok(links);
  assert.match(links?.hotels ?? "", /^https:\/\/example\.com\/hotels\?redirect=/);
  assert.match(decodeURIComponent(links?.hotels ?? ""), /https:\/\/www\.hotels\.com\/Hotel-Search\?/);
  assert.match(links?.expedia ?? "", /^https:\/\/example\.com\/expedia\?redirect=/);
  assert.match(decodeURIComponent(links?.expedia ?? ""), /https:\/\/www\.expedia\.com\/Hotel-Search\?/);
  assert.match(links?.vrbo ?? "", /^https:\/\/example\.com\/vrbo\?redirect=/);
  assert.match(decodeURIComponent(links?.vrbo ?? ""), /https:\/\/www\.vrbo\.com\/search\?/);
});
