const { fetchCandles } = require("../dist/providers/tradingview");
const fs = require("fs");
const path = require("path");

const TIMEZONE = "America/New_York";
const SYMBOLS = [
  { name: "MNQ1!", tv: "CME_MINI:MNQ1!" },
  { name: "GC1!", tv: "COMEX:GC1!" },
];

async function fetchAndSave(symbol, tvSymbol, timeframe, count, label) {
  console.log(`Fetching ${label} for ${symbol} (count=${count})...`);
  try {
    const candles = await fetchCandles(tvSymbol, timeframe, count);
    console.log(`  -> Received ${candles.length} candles`);
    const file = path.join(__dirname, `raw-${symbol}-${label}.json`);
    fs.writeFileSync(file, JSON.stringify(candles, null, 2));
    console.log(`  -> Saved to ${file}`);
    return candles;
  } catch (err) {
    console.error(`  -> FAILED: ${err.message}`);
    return [];
  }
}

(async () => {
  for (const s of SYMBOLS) {
    // Fetch maximum history for 1h (for H7 aggregation) and 4h
    await fetchAndSave(s.name, s.tv, "60", 5000, "1h");
    await fetchAndSave(s.name, s.tv, "240", 2000, "4h");
  }
  console.log("\nAll fetches complete.");
})();
