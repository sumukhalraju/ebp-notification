const { fetchCandlesH7 } = require("../dist/providers/tradingview");

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

function getEtHour(timestamp) {
  const d = new Date(timestamp * 1000);
  return parseInt(
    new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, hour: "numeric", hour12: false }).format(d),
    10
  );
}

function evaluateSignals(prev, curr) {
  const signals = [];
  if (curr.low < prev.low && curr.close > prev.open) signals.push("sweep_low");
  if (curr.high > prev.high && curr.close < prev.open) signals.push("sweep_high");
  return signals;
}

(async () => {
  console.log(`Fetching H7 candles for ${TV_SYMBOL}...`);
  const candles = await fetchCandlesH7(TV_SYMBOL, TIMEZONE, 15);
  console.log(`Received ${candles.length} H7 candles\n`);

  console.log("Recent H7 candles:");
  for (const c of candles.slice(-8)) {
    console.log(`  ${formatEt(c.time)} | O:${c.open.toFixed(2)} H:${c.high.toFixed(2)} L:${c.low.toFixed(2)} C:${c.close.toFixed(2)}`);
  }

  console.log("\n=== ALL consecutive pairs evaluated (no filter) ===\n");
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1];
    const curr = candles[i];
    const prevHour = getEtHour(prev.time);
    const currHour = getEtHour(curr.time);
    const signals = evaluateSignals(prev, curr);

    const line = `${formatEt(prev.time)} (${prevHour}:00) -> ${formatEt(curr.time)} (${currHour}:00)`;
    if (signals.length > 0) {
      console.log(`>>> SIGNAL: ${line} — ${signals.join(", ")}`);
    } else {
      console.log(`    No signal: ${line}`);
    }
  }
})();
