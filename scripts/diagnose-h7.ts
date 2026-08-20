import { fetchCandles, fetchCandlesH7 } from "../src/providers/tradingview";
import { evaluateSignals } from "../src/signals";
import { formatTime } from "../src/format";
import { getZonedHour } from "../src/time";
import { aggregateToH7, isH7Transition, DEFAULT_H7_TRANSITIONS } from "../src/h7";

const TIMEZONE = "America/New_York";
const SYMBOLS = [
  { symbol: "MNQ1!", tv: "CME_MINI:MNQ1!" },
  { symbol: "GC1!", tv: "COMEX:GC1!" }
];

async function diagnoseSymbol(tvSymbol: string, name: string): Promise<void> {
  console.log(`\n========================================`);
  console.log(`Symbol: ${name} (${tvSymbol})`);
  console.log(`========================================\n`);

  const count1h = 300;
  console.log(`Fetching ${count1h} 1h candles...`);
  const candles1h = await fetchCandles(tvSymbol, "60", count1h);
  console.log(`Received ${candles1h.length} 1h candles\n`);

  console.log("--- Last 50 1h candles (ET) ---");
  for (const c of candles1h.slice(-50)) {
    const hour = getZonedHour(c.time, TIMEZONE);
    const isTarget = [18, 1, 8].includes(hour);
    console.log(
      `  ${formatTime(c.time, TIMEZONE)} (ET hour ${hour}) ${isTarget ? "[TARGET]" : "        "} | O:${c.open.toFixed(2)} H:${c.high.toFixed(2)} L:${c.low.toFixed(2)} C:${c.close.toFixed(2)}`
    );
  }

  console.log(`\n--- App H7 candles (count=10) ---`);
  const currentH7 = await fetchCandlesH7(tvSymbol, TIMEZONE, 10);
  for (const c of currentH7) {
    console.log(
      `  ${formatTime(c.time, TIMEZONE)} | O:${c.open.toFixed(2)} H:${c.high.toFixed(2)} L:${c.low.toFixed(2)} C:${c.close.toFixed(2)}`
    );
  }

  const aggregated = aggregateToH7(candles1h, TIMEZONE, 10);
  console.log(`\n--- Signal Evaluation ---`);
  for (let i = 1; i < aggregated.length; i++) {
    const prev = aggregated[i - 1];
    const curr = aggregated[i];
    const isTargetPair = isH7Transition(prev, curr, TIMEZONE, DEFAULT_H7_TRANSITIONS);
    const signals = evaluateSignals(prev, curr);
    console.log(`\n  Pair: ${formatTime(prev.time, TIMEZONE)} -> ${formatTime(curr.time, TIMEZONE)}`);
    console.log(`    Target transition: ${isTargetPair}`);
    if (signals.length > 0) {
      console.log(`    >>> SIGNALS: ${signals.map((s) => s.id).join(", ")} <<<`);
    } else {
      console.log(`    No signal`);
    }
  }
}

async function main(): Promise<void> {
  for (const s of SYMBOLS) {
    try {
      await diagnoseSymbol(s.tv, s.symbol);
    } catch (err) {
      console.error(`Error diagnosing ${s.symbol}:`, err instanceof Error ? err.message : err);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
