import { Candle } from "./types";

export function timeframeToSeconds(timeframe: string): number | null {
  const minutes = Number(timeframe);
  if (Number.isFinite(minutes)) {
    return minutes * 60;
  }

  const match = timeframe.trim().match(/^(\d+)([a-zA-Z])$/);
  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  const rawUnit = match[2];
  const unit = rawUnit.toUpperCase();

  if (rawUnit === "m") {
    return value * 60;
  }

  switch (unit) {
    case "H":
      return value * 3600;
    case "D":
      return value * 86400;
    case "W":
      return value * 604800;
    case "M":
      return value * 2592000;
    default:
      return null;
  }
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function getZonedHour(epochSeconds: number, timeZone: string): number {
  const hourStr = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hour12: false,
    hourCycle: "h23"
  }).format(new Date(epochSeconds * 1000));
  return parseInt(hourStr, 10);
}

export function filterClosedCandles(
  candles: Candle[],
  timeframeSeconds: number | null,
  nowSeconds: number
): Candle[] {
  return candles.filter((candle, index) => {
    if (timeframeSeconds !== null) {
      return nowSeconds >= candle.time + timeframeSeconds;
    }
    return index < candles.length - 1;
  });
}

export function candleFetchCount(
  timeframeSeconds: number | null,
  lookbackDays: number,
  fallback = 10
): number {
  if (timeframeSeconds === null || timeframeSeconds <= 0 || lookbackDays <= 0) {
    return fallback;
  }
  return Math.ceil((lookbackDays * 86400) / timeframeSeconds) + 2;
}

export function hourBucket(epochSeconds: number): number {
  return Math.floor(epochSeconds / 3600) * 3600;
}
