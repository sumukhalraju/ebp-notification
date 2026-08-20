import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatPrice, formatTime, formatTimeframe } from "../src/format";

describe("formatPrice", () => {
  it("formats with thousands separators and two decimals", () => {
    assert.equal(formatPrice(1234.5), "1,234.50");
  });

  it("returns n/a for non-finite values", () => {
    assert.equal(formatPrice(Number.NaN), "n/a");
  });
});

describe("formatTimeframe", () => {
  it("renders hour multiples as H", () => {
    assert.equal(formatTimeframe("240"), "4H");
    assert.equal(formatTimeframe("420"), "7H");
  });

  it("renders other minute values as m", () => {
    assert.equal(formatTimeframe("15"), "15m");
  });
});

describe("formatTime", () => {
  it("falls back to UTC for an invalid zone", () => {
    const formatted = formatTime(0, "Not/A_Zone");
    assert.equal(typeof formatted, "string");
    assert.ok(formatted.length > 0);
  });
});
