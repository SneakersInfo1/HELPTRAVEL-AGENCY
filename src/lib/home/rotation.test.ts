import assert from "node:assert/strict";
import { test } from "node:test";

import { rotateSlice, rotationBucket } from "./rotation";

test("rotationBucket respektuje długość i granice okna", () => {
  assert.equal(rotationBucket(0, 1_000), 0);
  assert.equal(rotationBucket(999, 1_000), 0);
  assert.equal(rotationBucket(1_000, 1_000), 1);
  assert.equal(rotationBucket(3_599_999, 3_600_000), 0);
  assert.equal(rotationBucket(3_600_000, 3_600_000), 1);
  assert.equal(rotationBucket(12 * 3_600_000, 2 * 3_600_000), 6);
});

test("rotateSlice zwraca całą pulę bez rotacji, gdy wycinek nie jest mniejszy", () => {
  assert.deepEqual(rotateSlice(["a", "b"], 3, 1), ["a", "b"]);
  assert.deepEqual(rotateSlice(["a", "b"], 2, 7), ["a", "b"]);
});

test("rotateSlice zawija wycinek na początku puli", () => {
  assert.deepEqual(rotateSlice(["a", "b", "c", "d", "e"], 2, 2), ["e", "a"]);
});

test("rotateSlice po pełnym obrocie wraca do początku", () => {
  const pool = ["a", "b", "c", "d", "e", "f"];
  assert.deepEqual(rotateSlice(pool, 2, 0), ["a", "b"]);
  assert.deepEqual(rotateSlice(pool, 2, 3), ["a", "b"]);
});

test("rotateSlice obsługuje pustą pulę i ujemny bucket", () => {
  assert.deepEqual(rotateSlice([], 3, 2), []);
  assert.deepEqual(rotateSlice(["a", "b", "c", "d", "e"], 2, -1), ["d", "e"]);
});
