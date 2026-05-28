const { fetchCandles } = require("./dist/providers/tradingview");

const TIMEZONE = "America/New_York";
const TV_SYMBOL = "CME_MINI:MNQ1!";

function formatEt(timestamp) {
  const d = new Date(timestamp * 1000);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function evaluateSignals(previous, current) {
  const signals = [];
  if (current.low < previous.low && current.close > previous.open) {
    signals.push({ id: "sweep_low", label: "Low sweep and close above previous open" });
  }
  if (current.high > previous.high && current.close < previous.open) {
    signals.push({ id: "sweep_high", label: "High sweep and close below previous open" });
  }
  return signals;
}

(async () => {
  console.log(`Today: ${new Date().toISOString()} UTC`);
  console.log(`Fetching 4H candles for ${TV_SYMBOL}...\n`);
  const candles = await fetchCandles(TV_SYMBOL, "240", 20);
  console.log(`Received ${candles.length} candles\n`);

  console.log("All 4H candles:");
  for (const c of candles) {
    console.log(`  ${formatEt(c.time)} | O:${c.open.toFixed(2)} H:${c.high.toFixed(2)} L:${c.low.toFixed(2)} C:${c.close.toFixed(2)}`);
  }

  console.log("\n=== Signal Evaluation ===\n");
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1];
    const curr = candles[i];
    const signals = evaluateSignals(prev, curr);
    if (signals.length > 0) {
      console.log(`\n>>> SIGNAL at ${formatEt(curr.time)}: ${signals.map(s => s.id).join(", ")} <<<`);
      console.log(`    PREV  O:${prev.open.toFixed(2)} H:${prev.high.toFixed(2)} L:${prev.low.toFixed(2)} C:${prev.close.toFixed(2)}`);
      console.log(`    CURR  O:${curr.open.toFixed(2)} H:${curr.high.toFixed(2)} L:${curr.low.toFixed(2)} C:${curr.close.toFixed(2)}`);
    }
  }
})();
