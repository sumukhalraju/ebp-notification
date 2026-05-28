const fs = require("fs");
const path = require("path");

const occurrences = JSON.parse(fs.readFileSync(path.join(__dirname, "pattern-occurrences.json"), "utf-8"));

function groupBy(keyFn) {
  const map = {};
  for (const o of occurrences) {
    const k = keyFn(o);
    if (!map[k]) map[k] = [];
    map[k].push(o);
  }
  return map;
}

function avg(arr) {
  return arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
}

// Detailed H4 vs H7 breakdown
const byTf = groupBy(o => o.timeframe);

let report = `# EBP Pattern Research Report\n\n`;
report += `Generated: ${new Date().toISOString()}\n\n`;
report += `---\n\n`;

report += `## Overview\n\n`;
report += `- **Total patterns analyzed:** ${occurrences.length}\n`;
report += `- **Symbols:** MNQ1!, GC1!\n`;
report += `- **Timeframes:** 4H, H7\n`;
report += `- **Date range:** Full available history (~5000 1h candles per symbol)\n\n`;

report += `## Pattern Distribution\n\n`;
report += `| Metric | Value |\n`;
report += `|--------|-------|\n`;
report += `| sweep_low | ${occurrences.filter(o => o.pattern === "sweep_low").length} |\n`;
report += `| sweep_high | ${occurrences.filter(o => o.pattern === "sweep_high").length} |\n`;
report += `| MNQ1! | ${occurrences.filter(o => o.symbol === "MNQ1!").length} |\n`;
report += `| GC1! | ${occurrences.filter(o => o.symbol === "GC1!").length} |\n`;
report += `| 4H timeframe | ${occurrences.filter(o => o.timeframe === "4h").length} |\n`;
report += `| H7 timeframe | ${occurrences.filter(o => o.timeframe === "7h").length} |\n\n`;

report += `## Timing Analysis\n\n`;
report += `### By Hour (ET) — All Patterns Combined\n\n`;
report += `| Hour | Count | % of Total |\n`;
report += `|------|-------|------------|\n`;

const byHour = groupBy(o => o.hour);
const hours = Object.keys(byHour).map(Number).sort((a, b) => a - b);
for (const h of hours) {
  const count = byHour[h].length;
  const pct = ((count / occurrences.length) * 100).toFixed(1);
  report += `| ${String(h).padStart(2, "0")}:00 | ${count} | ${pct}% |\n`;
}

report += `\n**Key insight:** The 06:00 ET hour has the highest concentration (${byHour[6]?.length || 0} patterns), followed by 18:00 ET (${byHour[18]?.length || 0}). These correspond to the 4H candle closes.\n\n`;

report += `### By Day of Week\n\n`;
report += `| Day | Count | % of Total |\n`;
report += `|-----|-------|------------|\n`;
const dayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const byDay = groupBy(o => o.day);
for (const day of dayOrder) {
  if (byDay[day]) {
    const count = byDay[day].length;
    const pct = ((count / occurrences.length) * 100).toFixed(1);
    report += `| ${day} | ${count} | ${pct}% |\n`;
  }
}

report += `\n**Key insight:** Tuesday and Wednesday are peak days. Sunday has minimal activity due to limited CME trading hours.\n\n`;

report += `## 4H vs H7 Comparison\n\n`;

for (const tf of ["4h", "7h"]) {
  const data = byTf[tf] || [];
  const sl = data.filter(o => o.pattern === "sweep_low");
  const sh = data.filter(o => o.pattern === "sweep_high");
  const sizes = data.map(o => o.sweepSize);
  report += `### ${tf.toUpperCase()} Timeframe\n\n`;
  report += `- Total signals: ${data.length}\n`;
  report += `- sweep_low: ${sl.length} (${((sl.length / data.length) * 100).toFixed(1)}%)\n`;
  report += `- sweep_high: ${sh.length} (${((sh.length / data.length) * 100).toFixed(1)}%)\n`;
  report += `- Avg sweep size: ${avg(sizes).toFixed(2)}\n`;
  report += `- Min sweep size: ${Math.min(...sizes).toFixed(2)}\n`;
  report += `- Max sweep size: ${Math.max(...sizes).toFixed(2)}\n\n`;
}

report += `## Sweep Size Analysis\n\n`;
report += `This is critical for understanding false alarms.\n\n`;
report += `### Sweep Size Distribution (All Patterns)\n\n`;

const allSizes = occurrences.map(o => o.sweepSize).sort((a, b) => a - b);
const percentiles = [10, 25, 50, 75, 90, 95, 99];
report += `| Percentile | Sweep Size |\n`;
report += `|------------|------------|\n`;
for (const p of percentiles) {
  const idx = Math.floor((p / 100) * allSizes.length);
  report += `| ${p}th | ${allSizes[idx].toFixed(2)} |\n`;
}

report += `\n**Key insight:** 50% of all signals have a sweep size under ${allSizes[Math.floor(0.5 * allSizes.length)].toFixed(2)} points. The minimum sweep ever recorded was ${Math.min(...allSizes).toFixed(2)} points — essentially a 1-tick false alarm.\n\n`;

report += `### Tiny Sweeps (< 5 points) — Likely False Alarms\n\n`;
const tiny = occurrences.filter(o => o.sweepSize < 5);
report += `- Count: ${tiny.length} out of ${occurrences.length} (${((tiny.length / occurrences.length) * 100).toFixed(1)}%)\n`;
report += `- By timeframe: ${tiny.filter(o => o.timeframe === "4h").length} (4H), ${tiny.filter(o => o.timeframe === "7h").length} (H7)\n\n`;

report += `## Top 20 Dates with Most Patterns\n\n`;
report += `| Date | Count |\n`;
report += `|------|-------|\n`;
const byDate = groupBy(o => o.date);
const topDates = Object.entries(byDate).sort((a, b) => b[1].length - a[1].length).slice(0, 20);
for (const [date, list] of topDates) {
  report += `| ${date} | ${list.length} |\n`;
}

report += `\n---\n\n`;
report += `## Recommendations\n\n`;
report += `1. **Add a minimum sweep threshold:** Based on the 25th percentile, a threshold of ~${allSizes[Math.floor(0.25 * allSizes.length)].toFixed(0)} points would eliminate the weakest signals while preserving 75% of occurrences.\n`;
report += `2. **H7 is cleaner:** H7 produces fewer signals (${byTf["7h"]?.length || 0}) than 4H (${byTf["4h"]?.length || 0}), but each one is more significant due to the larger timeframe.\n`;
report += `3. **06:00 ET peak:** The 06:00 hour is the highest-frequency window. Consider whether overnight gaps are causing noisy signals.\n`;
report += `4. **Weekend/Sunday:** Only ${byDay["Sun"]?.length || 0} Sunday signals in the entire dataset. The pattern is mostly a weekday phenomenon.\n`;

fs.writeFileSync(path.join(__dirname, "REPORT.md"), report);
console.log("Report saved to Research/REPORT.md");
