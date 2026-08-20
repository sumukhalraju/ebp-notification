import { fetchCandles } from "../src/providers/tradingview";
import { evaluateSignals } from "../src/signals";
import { formatTime } from "../src/format";

const TIMEZONE = "America/New_York";
const TV_SYMBOL = "CME_MINI:MNQ1!";

async function main(): Promise<void> {
  console.log(`Today: ${new Date().toISOString()} UTC`);
  console.log(`Fetching 4H candles for ${TV_SYMBOL}...\n`);
  const candles = await fetchCandles(TV_SYMBOL, "240", 20);
  console.log(`Received ${candles.length} candles\n`);

  console.log("All 4H candles:");
  for (const c of candles) {
    console.log(
      `  ${formatTime(c.time, TIMEZONE)} | O:${c.open.toFixed(2)} H:${c.high.toFixed(2)} L:${c.low.toFixed(2)} C:${c.close.toFixed(2)}`
    );
  }

  console.log("\n=== Signal Evaluation ===\n");
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1];
    const curr = candles[i];
    const signals = evaluateSignals(prev, curr);
    if (signals.length > 0) {
      console.log(`\n>>> SIGNAL at ${formatTime(curr.time, TIMEZONE)}: ${signals.map((s) => s.id).join(", ")} <<<`);
      console.log(`    PREV  O:${prev.open.toFixed(2)} H:${prev.high.toFixed(2)} L:${prev.low.toFixed(2)} C:${prev.close.toFixed(2)}`);
      console.log(`    CURR  O:${curr.open.toFixed(2)} H:${curr.high.toFixed(2)} L:${curr.low.toFixed(2)} C:${curr.close.toFixed(2)}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
