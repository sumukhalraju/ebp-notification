import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildMessage, buildRunSummary } from "../src/messages";

describe("notification messages", () => {
  it("keeps signal alerts compact", () => {
    const message = buildMessage({
      entry: { symbol: "ES1!", exchange: "CME", name: "E-mini S&P 500" },
      tvSymbol: "CME_MINI:ES1!",
      timeframeLabel: "4H",
      previous: { time: 1, open: 5000, high: 5010, low: 4990, close: 5005 },
      current: { time: 2, open: 5005, high: 5015, low: 4985, close: 5012 },
      timeZone: "America/New_York",
      signal: { id: "sweep_low", label: "Low sweep and close above previous open" }
    });

    assert.match(message, /E-mini S&P 500 \(CME_MINI:ES1!\) — Low sweep/);
    assert.match(message, /Previous: O 5,000\.00 · H 5,010\.00 · L 4,990\.00 · C 5,005\.00/);
    assert.doesNotMatch(message, /═|Open\s*:|High\s*:|Low\s*:|Close\s*:|Signal\s*:|Timeframe\s*:/);
  });

  it("omits no-signal rows from the scan summary", () => {
    const summary = buildRunSummary(
      [
        { symbol: "CME_MINI:ES1!", patterns: 1 },
        { symbol: "CME_MINI:NQ1!", patterns: 0 }
      ],
      { timeframe: "240", timezone: "America/New_York", cron: "0 * * * *" }
    );

    assert.match(summary, /CME_MINI:ES1!.*1 signal/);
    assert.doesNotMatch(summary, /NQ1!|no EBP detected/);
  });
});
