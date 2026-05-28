# EBP Pattern Research Report

Generated: 2026-05-28T04:15:59.688Z

---

## Overview

- **Total patterns analyzed:** 977
- **Symbols:** MNQ1!, GC1!
- **Timeframes:** 4H, H7
- **Date range:** Full available history (~5000 1h candles per symbol)

## Pattern Distribution

| Metric | Value |
|--------|-------|
| sweep_low | 514 |
| sweep_high | 463 |
| MNQ1! | 546 |
| GC1! | 431 |
| 4H timeframe | 755 |
| H7 timeframe | 222 |

## Timing Analysis

### By Hour (ET) — All Patterns Combined

| Hour | Count | % of Total |
|------|-------|------------|
| 01:00 | 71 | 7.3% |
| 02:00 | 149 | 15.3% |
| 06:00 | 197 | 20.2% |
| 08:00 | 151 | 15.5% |
| 10:00 | 138 | 14.1% |
| 14:00 | 44 | 4.5% |
| 18:00 | 163 | 16.7% |
| 22:00 | 64 | 6.6% |

**Key insight:** The 06:00 ET hour has the highest concentration (197 patterns), followed by 18:00 ET (163). These correspond to the 4H candle closes.

### By Day of Week

| Day | Count | % of Total |
|-----|-------|------------|
| Mon | 174 | 17.8% |
| Tue | 210 | 21.5% |
| Wed | 214 | 21.9% |
| Thu | 210 | 21.5% |
| Fri | 135 | 13.8% |
| Sun | 34 | 3.5% |

**Key insight:** Tuesday and Wednesday are peak days. Sunday has minimal activity due to limited CME trading hours.

## 4H vs H7 Comparison

### 4H Timeframe

- Total signals: 755
- sweep_low: 390 (51.7%)
- sweep_high: 365 (48.3%)
- Avg sweep size: 22.00
- Min sweep size: 0.10
- Max sweep size: 190.00

### 7H Timeframe

- Total signals: 222
- sweep_low: 124 (55.9%)
- sweep_high: 98 (44.1%)
- Avg sweep size: 36.96
- Min sweep size: 0.10
- Max sweep size: 223.75

## Sweep Size Analysis

This is critical for understanding false alarms.

### Sweep Size Distribution (All Patterns)

| Percentile | Sweep Size |
|------------|------------|
| 10th | 1.40 |
| 25th | 4.10 |
| 50th | 12.25 |
| 75th | 34.25 |
| 90th | 68.75 |
| 95th | 97.25 |
| 99th | 148.50 |

**Key insight:** 50% of all signals have a sweep size under 12.25 points. The minimum sweep ever recorded was 0.10 points — essentially a 1-tick false alarm.

### Tiny Sweeps (< 5 points) — Likely False Alarms

- Count: 288 out of 977 (29.5%)
- By timeframe: 249 (4H), 39 (H7)

## Top 20 Dates with Most Patterns

| Date | Count |
|------|-------|
| 08/12/2025 | 9 |
| 06/17/2025 | 8 |
| 08/27/2025 | 7 |
| 11/06/2025 | 7 |
| 04/23/2026 | 7 |
| 05/07/2026 | 7 |
| 08/05/2025 | 6 |
| 09/11/2025 | 6 |
| 09/17/2025 | 6 |
| 10/22/2025 | 6 |
| 12/03/2025 | 6 |
| 12/04/2025 | 6 |
| 12/10/2025 | 6 |
| 12/23/2025 | 6 |
| 12/30/2025 | 6 |
| 01/09/2026 | 6 |
| 02/11/2026 | 6 |
| 02/12/2026 | 6 |
| 02/17/2026 | 6 |
| 02/19/2026 | 6 |

---

## Recommendations

1. **Add a minimum sweep threshold:** Based on the 25th percentile, a threshold of ~4 points would eliminate the weakest signals while preserving 75% of occurrences.
2. **H7 is cleaner:** H7 produces fewer signals (222) than 4H (755), but each one is more significant due to the larger timeframe.
3. **06:00 ET peak:** The 06:00 hour is the highest-frequency window. Consider whether overnight gaps are causing noisy signals.
4. **Weekend/Sunday:** Only 34 Sunday signals in the entire dataset. The pattern is mostly a weekday phenomenon.
