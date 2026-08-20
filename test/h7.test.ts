import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aggregateToH7, isH7Transition } from "../src/h7";
import { getZonedHour } from "../src/time";
import { Candle } from "../src/types";

const TZ = "America/New_York";

function hourCandle(time: number, price: number): Candle {
  return {
    time,
    open: price,
    high: price + 2,
    low: price - 2,
    close: price + 1
  };
}

describe("aggregateToH7", () => {
  it("builds 7H candles from 18/1/8 ET anchors", () => {
    // 2026-01-15 18:00 EST = 23:00 UTC
    const start = Date.UTC(2026, 0, 15, 23, 0, 0) / 1000;
    const candles: Candle[] = [];
    for (let i = 0; i < 20; i++) {
      candles.push(hourCandle(start + i * 3600, 100 + i));
    }

    const h7 = aggregateToH7(candles, TZ, 10);
    assert.ok(h7.length >= 1);
    assert.equal(getZonedHour(h7[0].time, TZ), 18);
    assert.equal(h7[0].open, 100);
    assert.equal(h7[0].close, 100 + 6 + 1);
    assert.equal(h7[0].high, 100 + 6 + 2);
    assert.equal(h7[0].low, 100 - 2);
  });

  it("skips an incomplete 7-hour group when an hour is missing", () => {
    const start = Date.UTC(2026, 0, 15, 23, 0, 0) / 1000;
    const candles: Candle[] = [];
    for (let i = 0; i < 10; i++) {
      if (i === 2) {
        continue;
      }
      candles.push(hourCandle(start + i * 3600, 100 + i));
    }

    const h7 = aggregateToH7(candles, TZ, 10);
    assert.equal(
      h7.some((c) => c.time === start),
      false
    );
  });

  it("still groups bars whose timestamps jitter within the hour", () => {
    const start = Date.UTC(2026, 0, 15, 23, 0, 0) / 1000;
    const candles: Candle[] = [];
    for (let i = 0; i < 7; i++) {
      candles.push(hourCandle(start + i * 3600 + 30, 100 + i));
    }

    const h7 = aggregateToH7(candles, TZ, 10);
    assert.equal(h7.length, 1);
    assert.equal(h7[0].open, 100);
    assert.equal(h7[0].close, 107);
  });
});

describe("isH7Transition", () => {
  it("allows 18->1 and 1->8 only", () => {
    const start18 = Date.UTC(2026, 0, 15, 23, 0, 0) / 1000;
    const start01 = Date.UTC(2026, 0, 16, 6, 0, 0) / 1000;
    const start08 = Date.UTC(2026, 0, 16, 13, 0, 0) / 1000;
    const c18 = hourCandle(start18, 1);
    const c01 = hourCandle(start01, 2);
    const c08 = hourCandle(start08, 3);
    const transitions: Array<[number, number]> = [
      [18, 1],
      [1, 8]
    ];

    assert.equal(isH7Transition(c18, c01, TZ, transitions), true);
    assert.equal(isH7Transition(c01, c08, TZ, transitions), true);
    assert.equal(isH7Transition(c08, c18, TZ, transitions), false);
  });
});
