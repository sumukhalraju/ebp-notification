import TradingView from "@mathieuc/tradingview";
import { aggregateToH7, DEFAULT_H7_ANCHOR_HOURS } from "../h7";
import { log } from "../log";
import { Candle, CandleProvider } from "../types";

type Period = {
  time: number;
  open: number;
  max?: number;
  high?: number;
  min?: number;
  low?: number;
  close: number;
  volume?: number;
};

const FETCH_TIMEOUT_MS = 15000;
const QUIET_SETTLE_MS = 1500;

function normalizePeriods(periods: unknown): Period[] {
  if (!periods) {
    return [];
  }

  if (Array.isArray(periods)) {
    return periods as Period[];
  }

  if (typeof periods === "object") {
    return Object.values(periods as Record<string, Period>);
  }

  return [];
}

function candlesFromPeriods(periods: Period[], count: number): Candle[] {
  return periods
    .map((period) => ({
      time: Number(period.time),
      open: Number(period.open),
      high: Number(period.max ?? period.high),
      low: Number(period.min ?? period.low),
      close: Number(period.close),
      volume: period.volume === undefined ? undefined : Number(period.volume)
    }))
    .filter(
      (period) =>
        Number.isFinite(period.time) &&
        Number.isFinite(period.open) &&
        Number.isFinite(period.high) &&
        Number.isFinite(period.low) &&
        Number.isFinite(period.close)
    )
    .sort((a, b) => a.time - b.time)
    .slice(-count);
}

function fetchCandlesOnce(tvSymbol: string, timeframe: string, count: number): Promise<Candle[]> {
  const client = new TradingView.Client();
  const chart = new client.Session.Chart();

  return new Promise((resolve, reject) => {
    let settled = false;
    let latest: Candle[] = [];
    let quietTimer: NodeJS.Timeout | undefined;

    const cleanup = () => {
      clearTimeout(timeoutId);
      if (quietTimer) {
        clearTimeout(quietTimer);
      }
      try {
        chart.delete();
      } catch {
        // ignore cleanup errors
      }
      try {
        client.end();
      } catch {
        // ignore cleanup errors
      }
    };

    const settle = (result: Candle[] | Error) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (result instanceof Error) {
        reject(result);
      } else {
        resolve(result);
      }
    };

    const timeoutId = setTimeout(() => {
      if (latest.length >= 2) {
        log.warn(`Timed out fetching ${tvSymbol}; using ${latest.length} candles already received`);
        settle(latest);
        return;
      }
      settle(new Error(`Timeout fetching candles for ${tvSymbol}`));
    }, FETCH_TIMEOUT_MS);

    if (typeof (chart as unknown as Record<string, unknown>).onError === "function") {
      (chart as unknown as { onError: (fn: (err: unknown) => void) => void }).onError((err: unknown) => {
        settle(new Error(`TradingView error for ${tvSymbol}: ${String(err)}`));
      });
    }

    chart.onUpdate(() => {
      try {
        const periods = normalizePeriods((chart as { periods?: unknown }).periods);
        const candles = candlesFromPeriods(periods, count);
        latest = candles;

        if (candles.length >= count) {
          settle(candles);
          return;
        }

        if (quietTimer) {
          clearTimeout(quietTimer);
        }
        quietTimer = setTimeout(() => {
          if (latest.length >= 2) {
            settle(latest);
          }
        }, QUIET_SETTLE_MS);
      } catch (error) {
        settle(error instanceof Error ? error : new Error(String(error)));
      }
    });

    chart.setMarket(tvSymbol, { timeframe, range: Math.max(count, 3) });
  });
}

export async function fetchCandlesH7(
  tvSymbol: string,
  timezone: string,
  count: number,
  anchorHours: number[] = DEFAULT_H7_ANCHOR_HOURS
): Promise<Candle[]> {
  const candles1h = await fetchCandles(tvSymbol, "60", Math.max(count * 30, 72));
  return aggregateToH7(candles1h, timezone, count, anchorHours);
}

export async function fetchCandles(tvSymbol: string, timeframe: string, count: number): Promise<Candle[]> {
  const maxRetries = 3;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fetchCandlesOnce(tvSymbol, timeframe, count);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError ?? new Error(`Failed to fetch candles for ${tvSymbol}`);
}

export const tradingViewProvider: CandleProvider = {
  fetchCandles,
  fetchCandlesH7
};
