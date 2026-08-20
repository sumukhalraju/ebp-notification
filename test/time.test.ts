import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  candleFetchCount,
  filterClosedCandles,
  getZonedHour,
  hourBucket,
  isValidTimeZone,
  timeframeToSeconds
} from "../src/time";
import { Candle } from "../src/types";

describe("timeframeToSeconds", () => {
  it("treats numeric strings as minutes", () => {
    assert.equal(timeframeToSeconds("240"), 14400);
    assert.equal(timeframeToSeconds("420"), 25200);
  });

  it("parses unit suffixes and keeps month vs minute distinct", () => {
    assert.equal(timeframeToSeconds("15m"), 900);
    assert.equal(timeframeToSeconds("4H"), 14400);
    assert.equal(timeframeToSeconds("1D"), 86400);
    assert.equal(timeframeToSeconds("1M"), 2592000);
  });

  it("returns null for unknown units", () => {
    assert.equal(timeframeToSeconds("4x"), null);
  });
});

describe("filterClosedCandles", () => {
  const candles: Candle[] = [
    { time: 1000, open: 1, high: 2, low: 0, close: 1 },
    { time: 2000, open: 1, high: 2, low: 0, close: 1 },
    { time: 3000, open: 1, high: 2, low: 0, close: 1 }
  ];

  it("keeps candles whose period has elapsed", () => {
    const closed = filterClosedCandles(candles, 1000, 3500);
    assert.deepEqual(
      closed.map((c) => c.time),
      [1000, 2000]
    );
  });

  it("drops the last candle when timeframe is unknown", () => {
    const closed = filterClosedCandles(candles, null, 99999);
    assert.deepEqual(
      closed.map((c) => c.time),
      [1000, 2000]
    );
  });
});

describe("helpers", () => {
  it("validates IANA time zones", () => {
    assert.equal(isValidTimeZone("America/New_York"), true);
    assert.equal(isValidTimeZone("Not/A_Zone"), false);
  });

  it("floors unix time to the hour", () => {
    assert.equal(hourBucket(1_700_000_030), 1_700_000_000 - (1_700_000_000 % 3600));
  });

  it("computes lookback fetch counts", () => {
    assert.equal(candleFetchCount(14400, 2), 14);
    assert.equal(candleFetchCount(null, 2, 10), 10);
  });

  it("reads clock hour with h23 (midnight is 0, not 24)", () => {
    const midnightUtc = Date.UTC(2026, 0, 15, 0, 0, 0) / 1000;
    assert.equal(getZonedHour(midnightUtc, "UTC"), 0);
  });
});
