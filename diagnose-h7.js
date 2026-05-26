const { fetchCandles, fetchCandlesH7 } = require("./dist/providers/tradingview");

const TIMEZONE = "America/New_York";
const SYMBOLS = [
  { symbol: "MNQ1!", exchange: "CME_MINI", tv: "CME_MINI:MNQ1!" },
  { symbol: "GC1!", exchange: "COMEX", tv: "COMEX:GC1!" },
];

function getEtHour(timestamp) {
  const d = new Date(timestamp * 1000);
  return parseInt(
    new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, hour: "numeric", hour12: false }).format(d),
    10
  );
}

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

// Replicate aggregateToH7 but from the END (most recent)
function aggregateToH7Recent(candles1h, timezone, desiredCount) {
  const targetHours = new Set([18, 1, 8]);
  const candleMap = new Map();
  for (const c of candles1h) {
    candleMap.set(c.time, c);
  }

  const result = [];
  // Iterate backwards from newest to oldest
  for (let idx = candles1h.length - 1; idx >= 0; idx--) {
    if (result.length >= desiredCount) break;

    const candle = candles1h[idx];
    const date = new Date(candle.time * 1000);
    const etHour = parseInt(
      new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hour12: false }).format(date),
      10
    );

    if (!targetHours.has(etHour)) continue;

    const group = [];
    for (let i = 0; i < 7; i++) {
      const c = candleMap.get(candle.time + i * 3600);
      if (!c) break;
      group.push(c);
    }
    if (group.length !== 7) continue;

    result.unshift({
      time: candle.time,
      open: group[0].open,
      high: Math.max(...group.map(c => c.high)),
      low: Math.min(...group.map(c => c.low)),
      close: group[6].close,
    });
  }

  return result;
}

async function diagnoseSymbol(tvSymbol, name) {
  console.log(`\n========================================`);
  console.log(`Symbol: ${name} (${tvSymbol})`);
  console.log(`========================================\n`);

  const count1h = 300;
  console.log(`Fetching ${count1h} 1h candles...`);
  const candles1h = await fetchCandles(tvSymbol, "60", count1h);
  console.log(`Received ${candles1h.length} 1h candles\n`);

  console.log("--- Last 50 1h candles (ET) ---");
  for (const c of candles1h.slice(-50)) {
    const et = formatEt(c.time);
    const hour = getEtHour(c.time);
    const isTarget = [18, 1, 8].includes(hour);
    console.log(
      `  ${et} (ET hour ${hour}) ${isTarget ? "[TARGET]" : "        "} | O:${c.open.toFixed(2)} H:${c.high.toFixed(2)} L:${c.low.toFixed(2)} C:${c.close.toFixed(2)}`
    );
  }

  // Check the most recent target-hour anchors and whether they have 7 consecutive hours
  console.log(`\n--- Anchor completeness check (last 20 target hours) ---`);
  const candleMap = new Map();
  for (const c of candles1h) candleMap.set(c.time, c);
  let checked = 0;
  for (let idx = candles1h.length - 1; idx >= 0 && checked < 20; idx--) {
    const c = candles1h[idx];
    const hour = getEtHour(c.time);
    if (![18, 1, 8].includes(hour)) continue;
    checked++;
    const group = [];
    for (let i = 0; i < 7; i++) {
      const g = candleMap.get(c.time + i * 3600);
      if (g) group.push(g);
      else break;
    }
    const complete = group.length === 7;
    console.log(`  ${formatEt(c.time)} (hour ${hour}) — ${complete ? "COMPLETE 7h" : "INCOMPLETE (only " + group.length + ")"}`);
    if (!complete && group.length > 0) {
      console.log(`    Missing at: ${formatEt(c.time + group.length * 3600)}`);
    }
  }

  // Current (buggy) H7 aggregation
  console.log(`\n--- Current app H7 candles (oldest-first, count=10) ---`);
  const currentH7 = await fetchCandlesH7(tvSymbol, TIMEZONE, 10);
  for (const c of currentH7) {
    console.log(`  ${formatEt(c.time)} | O:${c.open.toFixed(2)} H:${c.high.toFixed(2)} L:${c.low.toFixed(2)} C:${c.close.toFixed(2)}`);
  }

  // Fixed H7 aggregation (most recent)
  console.log(`\n--- FIXED H7 candles (most-recent-first, count=10) ---`);
  const fixedH7 = aggregateToH7Recent(candles1h, TIMEZONE, 10);
  for (const c of fixedH7) {
    console.log(`  ${formatEt(c.time)} | O:${c.open.toFixed(2)} H:${c.high.toFixed(2)} L:${c.low.toFixed(2)} C:${c.close.toFixed(2)}`);
  }

  // Evaluate signals on the FIXED most recent H7 candles
  console.log(`\n--- Signal Evaluation on FIXED (most recent) H7 ---`);
  for (let i = 1; i < fixedH7.length; i++) {
    const prev = fixedH7[i - 1];
    const curr = fixedH7[i];
    const prevHour = getEtHour(prev.time);
    const currHour = getEtHour(curr.time);

    const isTargetPair = (prevHour === 18 && currHour === 1) || (prevHour === 1 && currHour === 8);
    const signals = evaluateSignals(prev, curr);

    console.log(`\n  Pair: ${formatEt(prev.time)} (${prevHour}:00) -> ${formatEt(curr.time)} (${currHour}:00)`);
    console.log(`    Target transition: ${isTargetPair}`);
    console.log(`    PREV  O:${prev.open.toFixed(2)} H:${prev.high.toFixed(2)} L:${prev.low.toFixed(2)} C:${prev.close.toFixed(2)}`);
    console.log(`    CURR  O:${curr.open.toFixed(2)} H:${curr.high.toFixed(2)} L:${curr.low.toFixed(2)} C:${curr.close.toFixed(2)}`);
    if (signals.length > 0) {
      console.log(`    >>> SIGNALS: ${signals.map(s => s.id).join(", ")} <<<
`);
    } else {
      console.log(`    No signal`);
    }
  }

  console.log(`\n`);
}

(async () => {
  for (const s of SYMBOLS) {
    try {
      await diagnoseSymbol(s.tv, s.symbol);
    } catch (err) {
      console.error(`Error diagnosing ${s.symbol}:`, err.message);
    }
  }
})();
