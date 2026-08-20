import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { processCandles } from "../src/scan";
import { Candle, Settings, State } from "../src/types";

const settings: Settings = {
  timeframe: "60",
  timezone: "UTC",
  cron: "1 * * * *"
};

function c(time: number, open: number, high: number, low: number, close: number): Candle {
  return { time, open, high, low, close };
}

describe("processCandles", () => {
  const t0 = 1_700_000_000;
  const hour = 3600;
  const candles: Candle[] = [
    c(t0, 100, 110, 95, 102),
    c(t0 + hour, 101, 108, 90, 105),
    c(t0 + hour * 2, 104, 109, 100, 103),
    c(t0 + hour * 3, 103, 107, 101, 104)
  ];
  const nowSeconds = t0 + hour * 5;
  const entry = { symbol: "MNQ1!", exchange: "CME_MINI" };

  it("on first run evaluates only the latest closed pair", () => {
    const state: State = {};
    const result = processCandles({
      entry,
      tvSymbol: "CME_MINI:MNQ1!",
      timeframe: "60",
      timeframeSeconds: hour,
      settings,
      state,
      candles,
      nowSeconds
    });

    assert.equal(result.patterns, 0);
    assert.equal(state["CME_MINI:MNQ1!|60"]?.lastChecked, t0 + hour * 3);
  });

  it("alerts the latest pair on first run when it matches", () => {
    const withSignal: Candle[] = [
      c(t0, 100, 110, 95, 102),
      c(t0 + hour, 101, 108, 96, 103),
      c(t0 + hour * 2, 100, 110, 95, 102),
      c(t0 + hour * 3, 101, 108, 90, 105)
    ];
    const state: State = {};
    const result = processCandles({
      entry,
      tvSymbol: "CME_MINI:MNQ1!",
      timeframe: "60",
      timeframeSeconds: hour,
      settings,
      state,
      candles: withSignal,
      nowSeconds
    });

    assert.equal(result.patterns, 1);
    assert.equal(result.messages.length, 1);
    assert.match(result.messages[0], /Low sweep/);
  });

  it("backfills closed pairs newer than lastChecked", () => {
    const state: State = {
      "CME_MINI:MNQ1!|60": { lastChecked: t0 }
    };
    const result = processCandles({
      entry,
      tvSymbol: "CME_MINI:MNQ1!",
      timeframe: "60",
      timeframeSeconds: hour,
      settings,
      state,
      candles,
      nowSeconds
    });

    assert.equal(result.patterns, 1);
    assert.equal(state["CME_MINI:MNQ1!|60"]?.lastChecked, t0 + hour * 3);
    assert.equal(state["CME_MINI:MNQ1!|60"]?.lastAlert, t0 + hour);
  });

  it("respects shouldEvaluate filters and still advances lastChecked", () => {
    const state: State = {
      "CME_MINI:MNQ1!|60": { lastChecked: t0 }
    };
    const result = processCandles({
      entry,
      tvSymbol: "CME_MINI:MNQ1!",
      timeframe: "60",
      timeframeSeconds: hour,
      settings,
      state,
      candles,
      nowSeconds,
      shouldEvaluate: () => false
    });

    assert.equal(result.patterns, 0);
    assert.equal(state["CME_MINI:MNQ1!|60"]?.lastChecked, t0 + hour * 3);
  });
});
