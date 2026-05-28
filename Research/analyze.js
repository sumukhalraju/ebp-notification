const fs = require("fs");
const path = require("path");

const TIMEZONE = "America/New_York";
const SYMBOLS = ["MNQ1!", "GC1!"];

function loadRaw(symbol, label) {
  const file = path.join(__dirname, `raw-${symbol}-${label}.json`);
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function getEtHour(timestamp) {
  const d = new Date(timestamp * 1000);
  return parseInt(
    new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, hour: "numeric", hour12: false }).format(d),
    10
  );
}

function getEtDay(timestamp) {
  const d = new Date(timestamp * 1000);
  return parseInt(
    new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, weekday: "short" }).format(d),
    10
  );
}

function getEtDate(timestamp) {
  const d = new Date(timestamp * 1000);
  return new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function getEtDayName(timestamp) {
  const d = new Date(timestamp * 1000);
  return new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, weekday: "short" }).format(d);
}

function aggregateToH7(candles1h, desiredCount) {
  const targetHours = new Set([18, 1, 8]);
  const candleMap = new Map();
  for (const c of candles1h) candleMap.set(c.time, c);

  const result = [];
  for (let idx = candles1h.length - 1; idx >= 0; idx--) {
    if (result.length >= desiredCount) break;
    const candle = candles1h[idx];
    const etHour = getEtHour(candle.time);
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

function evaluateSignals(prev, curr) {
  const signals = [];
  if (curr.low < prev.low && curr.close > prev.open) {
    signals.push("sweep_low");
  }
  if (curr.high > prev.high && curr.close < prev.open) {
    signals.push("sweep_high");
  }
  return signals;
}

function analyzeCandles(candles, label, symbol, isH7 = false) {
  const occurrences = [];

  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1];
    const curr = candles[i];

    if (isH7) {
      const prevHour = getEtHour(prev.time);
      const currHour = getEtHour(curr.time);
      const isTarget = (prevHour === 18 && currHour === 1) || (prevHour === 1 && currHour === 8);
      if (!isTarget) continue;
    }

    const signals = evaluateSignals(prev, curr);
    for (const sig of signals) {
      occurrences.push({
        symbol,
        timeframe: label,
        pattern: sig,
        timestamp: curr.time,
        date: getEtDate(curr.time),
        day: getEtDayName(curr.time),
        hour: getEtHour(curr.time),
        prevOpen: prev.open,
        prevHigh: prev.high,
        prevLow: prev.low,
        prevClose: prev.close,
        currOpen: curr.open,
        currHigh: curr.high,
        currLow: curr.low,
        currClose: curr.close,
        sweepSize: sig === "sweep_low" ? prev.low - curr.low : curr.high - prev.high,
      });
    }
  }

  return occurrences;
}

function computeStats(occurrences) {
  const total = occurrences.length;
  const byPattern = { sweep_low: 0, sweep_high: 0 };
  const bySymbol = {};
  const byTimeframe = {};
  const byHour = {};
  const byDay = {};
  const byDate = {};
  const sweepSizes = [];

  for (const o of occurrences) {
    byPattern[o.pattern]++;
    bySymbol[o.symbol] = (bySymbol[o.symbol] || 0) + 1;
    byTimeframe[o.timeframe] = (byTimeframe[o.timeframe] || 0) + 1;
    byHour[o.hour] = (byHour[o.hour] || 0) + 1;
    byDay[o.day] = (byDay[o.day] || 0) + 1;
    byDate[o.date] = (byDate[o.date] || 0) + 1;
    sweepSizes.push(o.sweepSize);
  }

  const avgSweep = sweepSizes.reduce((a, b) => a + b, 0) / (sweepSizes.length || 1);
  const minSweep = Math.min(...sweepSizes);
  const maxSweep = Math.max(...sweepSizes);

  return {
    total,
    byPattern,
    bySymbol,
    byTimeframe,
    byHour,
    byDay,
    byDate,
    avgSweep: avgSweep.toFixed(2),
    minSweep: minSweep.toFixed(2),
    maxSweep: maxSweep.toFixed(2),
  };
}

function printStats(stats, title) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(title);
  console.log(`${"=".repeat(60)}`);
  console.log(`Total occurrences: ${stats.total}`);
  console.log(`\nBy Pattern:`);
  console.log(`  sweep_low:  ${stats.byPattern.sweep_low}`);
  console.log(`  sweep_high: ${stats.byPattern.sweep_high}`);
  console.log(`\nBy Symbol:`);
  for (const [k, v] of Object.entries(stats.bySymbol).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v}`);
  }
  console.log(`\nBy Timeframe:`);
  for (const [k, v] of Object.entries(stats.byTimeframe).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v}`);
  }
  console.log(`\nBy Hour (ET):`);
  for (const [k, v] of Object.entries(stats.byHour).sort((a, b) => a[0] - b[0])) {
    console.log(`  ${String(k).padStart(2, "0")}:00 → ${v} occurrence(s)`);
  }
  console.log(`\nBy Day of Week:`);
  const dayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  for (const day of dayOrder) {
    if (stats.byDay[day]) {
      console.log(`  ${day}: ${stats.byDay[day]}`);
    }
  }
  console.log(`\nSweep Size Stats:`);
  console.log(`  Average: ${stats.avgSweep}`);
  console.log(`  Min:     ${stats.minSweep}`);
  console.log(`  Max:     ${stats.maxSweep}`);
}

function printTopDates(byDate, title, topN = 10) {
  const sorted = Object.entries(byDate).sort((a, b) => b[1] - a[1]).slice(0, topN);
  console.log(`\n${title}`);
  for (const [date, count] of sorted) {
    console.log(`  ${date}: ${count} pattern(s)`);
  }
}

// Run analysis
const allOccurrences = [];

for (const symbol of SYMBOLS) {
  const candles1h = loadRaw(symbol, "1h");
  const candles4h = loadRaw(symbol, "4h");
  const candlesH7 = aggregateToH7(candles1h, 1000);

  console.log(`\n${symbol}:`);
  console.log(`  1h candles: ${candles1h.length}`);
  console.log(`  4h candles: ${candles4h.length}`);
  console.log(`  H7 candles: ${candlesH7.length}`);

  const h4Signals = analyzeCandles(candles4h, "4h", symbol, false);
  const h7Signals = analyzeCandles(candlesH7, "7h", symbol, true);

  allOccurrences.push(...h4Signals, ...h7Signals);
}

const stats = computeStats(allOccurrences);
printStats(stats, "EBP PATTERN STATISTICS — FULL HISTORY");
printTopDates(stats.byDate, "Top 10 Dates with Most Patterns:", 10);

// Save full occurrences list
fs.writeFileSync(path.join(__dirname, "pattern-occurrences.json"), JSON.stringify(allOccurrences, null, 2));
console.log(`\nFull occurrence list saved to pattern-occurrences.json (${allOccurrences.length} records)`);

// Save summary
fs.writeFileSync(path.join(__dirname, "pattern-summary.json"), JSON.stringify(stats, null, 2));
console.log(`Summary saved to pattern-summary.json`);
