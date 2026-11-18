import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dayLengthHours, formatDayLength, midMonthDayLength } from "./daylight";

describe("długość dnia", () => {
  it("na równiku trwa około 12 godzin przez cały rok", () => {
    for (const day of [15, 105, 196, 288, 349]) {
      const hours = dayLengthHours(0, day);
      assert.ok(Math.abs(hours - 12.1) < 0.15, `dzień ${day}: ${hours}`);
    }
  });

  it("zgadza się z tablicami dla Warszawy (52,2°N): ok. 7 h 45 min w przesileniu zimowym i 16 h 45 min w letnim", () => {
    const winter = dayLengthHours(52.23, 355);
    const summer = dayLengthHours(52.23, 172);
    assert.ok(Math.abs(winter - 7.7) < 0.2, `zima: ${winter}`);
    assert.ok(Math.abs(summer - 16.8) < 0.2, `lato: ${summer}`);
  });

  it("na półkuli południowej pory roku są odwrócone", () => {
    assert.ok(dayLengthHours(-33.9, 355) > 14);
    assert.ok(dayLengthHours(-33.9, 172) < 10.2);
  });

  it("za kołem podbiegunowym zwraca dzień albo noc polarną zamiast błędu", () => {
    assert.equal(dayLengthHours(69.7, 172), 24);
    assert.equal(dayLengthHours(69.7, 355), 0);
  });

  it("wartość dla połowy miesiąca jest zaokrąglona do 5 minut i sformatowana po polsku", () => {
    const january = midMonthDayLength(41.38, 0);
    assert.equal(january.totalMinutes % 5, 0);
    assert.ok(january.totalMinutes > 9 * 60 + 15 && january.totalMinutes < 9 * 60 + 50, String(january.totalMinutes));
    assert.equal(formatDayLength({ hours: 9, minutes: 35 }), "9 h 35 min");
    assert.equal(formatDayLength({ hours: 12, minutes: 0 }), "12 h");
  });
});
