import { fetchCandlesH7 } from "../src/providers/tradingview";
import { formatTime } from "../src/format";

const TIMEZONE = "America/New_York";
const SYMBOLS = [
  { symbol: "MNQ1!", tv: "CME_MINI:MNQ1!" },
  { symbol: "GC1!", tv: "COMEX:GC1!" }
];

async function verify(tvSymbol: string, name: string): Promise<void> {
  console.log(`\n=== ${name} (${tvSymbol}) ===`);
  const candles = await fetchCandlesH7(tvSymbol, TIMEZONE, 10);
  console.log(`Received ${candles.length} H7 candles`);
  console.log("Most recent 5:");
  for (const c of candles.slice(-5)) {
    console.log(
      `  ${formatTime(c.time, TIMEZONE)} | O:${c.open.toFixed(2)} H:${c.high.toFixed(2)} L:${c.low.toFixed(2)} C:${c.close.toFixed(2)}`
    );
  }

  const newest = candles[candles.length - 1];
  if (!newest) {
    console.log("  No H7 candles returned");
    return;
  }

  const daysOld = (Date.now() / 1000 - newest.time) / 86400;
  if (daysOld > 2) {
    console.log(`  STALE: newest candle is ${daysOld.toFixed(1)} days old`);
  } else {
    console.log(`  OK: newest candle is ${daysOld.toFixed(1)} days old`);
  }
}

async function main(): Promise<void> {
  for (const s of SYMBOLS) {
    try {
      await verify(s.tv, s.symbol);
    } catch (err) {
      console.error(`Error: ${s.symbol}:`, err instanceof Error ? err.message : err);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
