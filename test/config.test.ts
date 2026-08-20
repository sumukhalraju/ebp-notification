import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeSettings, parseSymbolEntry } from "../src/config";

describe("parseSymbolEntry", () => {
  it("parses EXCHANGE:SYMBOL strings", () => {
    assert.deepEqual(parseSymbolEntry("COMEX:GC1!"), { symbol: "GC1!", exchange: "COMEX" });
  });

  it("accepts a bare symbol", () => {
    assert.deepEqual(parseSymbolEntry("MNQ1!"), { symbol: "MNQ1!" });
  });

  it("splits symbol when exchange is omitted from the object", () => {
    assert.deepEqual(parseSymbolEntry({ symbol: "CME_MINI:MNQ1!" }), {
      symbol: "MNQ1!",
      exchange: "CME_MINI"
    });
  });

  it("rejects empty symbols", () => {
    assert.throws(() => parseSymbolEntry("   "), /empty/);
  });
});

describe("normalizeSettings", () => {
  it("fills defaults and accepts a valid overlay", () => {
    const settings = normalizeSettings({
      timeframe: "240",
      timezone: "America/New_York",
      cron: "1 2,6,10,14,18,22 * * *",
      h7: true
    });
    assert.equal(settings.h7, true);
    assert.equal(settings.h7Cron, "1 1,8 * * *");
    assert.deepEqual(settings.h7AnchorHours, [18, 1, 8]);
    assert.equal(settings.fetchConcurrency, 2);
  });

  it("rejects an invalid timezone", () => {
    assert.throws(
      () =>
        normalizeSettings({
          timezone: "Mars/Phobos"
        }),
      /time zone/
    );
  });

  it("rejects an invalid cron expression", () => {
    assert.throws(
      () =>
        normalizeSettings({
          cron: "not a cron"
        }),
      /cron/
    );
  });
});
