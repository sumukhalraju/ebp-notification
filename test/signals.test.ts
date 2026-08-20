import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateSignals } from "../src/signals";
import { Candle } from "../src/types";

function candle(partial: Partial<Candle> & Pick<Candle, "open" | "high" | "low" | "close">): Candle {
  return { time: 0, ...partial };
}

describe("evaluateSignals", () => {
  it("detects a low sweep that closes above previous open", () => {
    const previous = candle({ open: 100, high: 110, low: 95, close: 102 });
    const current = candle({ open: 101, high: 108, low: 90, close: 105 });
    const signals = evaluateSignals(previous, current);
    assert.deepEqual(
      signals.map((s) => s.id),
      ["sweep_low"]
    );
  });

  it("detects a high sweep that closes below previous open", () => {
    const previous = candle({ open: 100, high: 110, low: 95, close: 102 });
    const current = candle({ open: 101, high: 120, low: 98, close: 99 });
    const signals = evaluateSignals(previous, current);
    assert.deepEqual(
      signals.map((s) => s.id),
      ["sweep_high"]
    );
  });

  it("requires a strict low/high break", () => {
    const previous = candle({ open: 100, high: 110, low: 95, close: 102 });
    const equalLow = candle({ open: 101, high: 108, low: 95, close: 105 });
    const equalHigh = candle({ open: 101, high: 110, low: 98, close: 99 });
    assert.equal(evaluateSignals(previous, equalLow).length, 0);
    assert.equal(evaluateSignals(previous, equalHigh).length, 0);
  });

  it("returns no signal when price does not sweep", () => {
    const previous = candle({ open: 100, high: 110, low: 95, close: 102 });
    const current = candle({ open: 101, high: 109, low: 96, close: 103 });
    assert.equal(evaluateSignals(previous, current).length, 0);
  });

  it("cannot emit both signals because close cannot be both above and below previous open", () => {
    const previous = candle({ open: 100, high: 110, low: 95, close: 102 });
    const wideDownClose = candle({ open: 100, high: 120, low: 80, close: 99 });
    const wideUpClose = candle({ open: 100, high: 120, low: 80, close: 101 });
    assert.deepEqual(
      evaluateSignals(previous, wideDownClose).map((s) => s.id),
      ["sweep_high"]
    );
    assert.deepEqual(
      evaluateSignals(previous, wideUpClose).map((s) => s.id),
      ["sweep_low"]
    );
  });
});
