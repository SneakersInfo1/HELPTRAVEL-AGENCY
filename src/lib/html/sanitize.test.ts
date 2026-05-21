// Sesja C pkt 6B — sanitizer must strip dangerous tags AND keep whitelisted
// structural tags so LiteAPI's `<p><strong>...</strong></p>` description
// renders as formatted prose.

import { test } from "node:test";
import assert from "node:assert/strict";

import { sanitizeHotelDescription } from "./sanitize";

test("keeps p/strong/em/br/ul/li from the LiteAPI shape", () => {
  const input = "<p><strong>Lux stay</strong> with <em>balcony</em>.</p><ul><li>WiFi</li><li>Pool</li></ul>";
  const out = sanitizeHotelDescription(input);
  assert.equal(out, "<p><strong>Lux stay</strong> with <em>balcony</em>.</p><ul><li>WiFi</li><li>Pool</li></ul>");
});

test("strips <script> blocks entirely", () => {
  const input = "<p>Hello</p><script>alert('xss')</script><p>World</p>";
  const out = sanitizeHotelDescription(input);
  assert.match(out, /^<p>Hello<\/p><p>World<\/p>$/);
  assert.equal(out.includes("script"), false);
});

test("strips event-handler attributes", () => {
  const input = "<p onclick=\"alert(1)\">click me</p>";
  const out = sanitizeHotelDescription(input);
  assert.equal(out, "<p>click me</p>");
});

test("drops disallowed tags, keeps inner text", () => {
  const input = "<div><span>plain</span></div>";
  const out = sanitizeHotelDescription(input);
  assert.equal(out, "plain");
});

test("returns empty string for null / empty input", () => {
  assert.equal(sanitizeHotelDescription(null), "");
  assert.equal(sanitizeHotelDescription(""), "");
  assert.equal(sanitizeHotelDescription("   "), "");
});

test("normalises br to self-closing", () => {
  const input = "Line one<br>Line two<br/>Line three";
  const out = sanitizeHotelDescription(input);
  assert.equal(out, "Line one<br />Line two<br />Line three");
});
