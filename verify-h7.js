const { fetchCandlesH7 } = require("./dist/providers/tradingview");

const TIMEZONE = "America/New_York";
const SYMBOLS = [
  { symbol: "MNQ1!", tv: "CME_MINI:MNQ1!" },
  { symbol: "GC1!", tv: "COMEX:GC1!" },
];

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

async function verify(tvSymbol, name) {
  console.log(`\n=== ${name} (${tvSymbol}) ===`);
  const candles = await fetchCandlesH7(tvSymbol, TIMEZONE, 10);
  console.log(`Received ${candles.length} H7 candles`);
  console.log("Most recent 5:");
  for (const c of candles.slice(-5)) {
    console.log(`  ${formatEt(c.time)} | O:${c.open.toFixed(2)} H:${c.high.toFixed(2)} L:${c.low.toFixed(2)} C:${c.close.toFixed(2)}`);
  }

  const newest = candles[candles.length - 1];
  const newestDate = newest ? new Date(newest.time * 1000) : null;
  const now = new Date();
  const daysOld = newestDate ? (now - newestDate) / (1000 * 60 * 60 * 24) : null;

  if (daysOld !== null) {
    if (daysOld > 2) {
      console.log(`  ⚠️  BUG STILL PRESENT: newest candle is ${daysOld.toFixed(1)} days old`);
    } else {
      console.log(`  ✅ FIXED: newest candle is ${daysOld.toFixed(1)} days old`);
    }
  }
}

(async () => {
  for (const s of SYMBOLS) {
    try {
      await verify(s.tv, s.symbol);
    } catch (err) {
      console.error(`Error: ${s.symbol}: ${err.message}`);
    }
  }
})();
