import { getZonedHour, hourBucket } from "./time";
import { Candle, HourPair } from "./types";

export const H7_TIMEFRAME = "420";
export const DEFAULT_H7_ANCHOR_HOURS = [18, 1, 8];
export const DEFAULT_H7_TRANSITIONS: HourPair[] = [
  [18, 1],
  [1, 8]
];

export function isH7Transition(
  previous: Candle,
  current: Candle,
  timezone: string,
  transitions: HourPair[]
): boolean {
  const prevHour = getZonedHour(previous.time, timezone);
  const currHour = getZonedHour(current.time, timezone);
  return transitions.some(([from, to]) => prevHour === from && currHour === to);
}

export function aggregateToH7(
  candles1h: Candle[],
  timezone: string,
  desiredCount: number,
  anchorHours: number[] = DEFAULT_H7_ANCHOR_HOURS
): Candle[] {
  const targetHours = new Set(anchorHours);
  const byHour = new Map<number, Candle>();
  for (const candle of candles1h) {
    byHour.set(hourBucket(candle.time), candle);
  }

  const sorted = [...candles1h].sort((a, b) => a.time - b.time);
  const result: Candle[] = [];
  const seen = new Set<number>();

  for (let idx = sorted.length - 1; idx >= 0; idx--) {
    if (result.length >= desiredCount) {
      break;
    }

    const candle = sorted[idx];
    const etHour = getZonedHour(candle.time, timezone);
    if (!targetHours.has(etHour)) {
      continue;
    }

    const startBucket = hourBucket(candle.time);
    if (seen.has(startBucket)) {
      continue;
    }

    const group: Candle[] = [];
    for (let i = 0; i < 7; i++) {
      const grouped = byHour.get(startBucket + i * 3600);
      if (!grouped) {
        break;
      }
      group.push(grouped);
    }
    if (group.length !== 7) {
      continue;
    }

    seen.add(startBucket);
    result.unshift({
      time: candle.time,
      open: group[0].open,
      high: Math.max(...group.map((item) => item.high)),
      low: Math.min(...group.map((item) => item.low)),
      close: group[6].close
    });
  }

  return result;
}
