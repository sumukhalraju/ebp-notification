import TradingView from "@mathieuc/tradingview";
import { Candle } from "../types";

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
    .filter((period) => Number.isFinite(period.time))
    .sort((a, b) => a.time - b.time)
    .slice(-count);
}

function fetchCandlesOnce(tvSymbol: string, timeframe: string, count: number): Promise<Candle[]> {
  const client = new TradingView.Client();
  const chart = new client.Session.Chart();

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout fetching candles for ${tvSymbol}`));
    }, 15000);

    let settled = false;

    const cleanup = () => {
      clearTimeout(timeoutId);
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
      if (settled) return;
      settled = true;
      cleanup();
      if (result instanceof Error) {
        reject(result);
      } else {
        resolve(result);
      }
    };

    if (typeof (chart as unknown as Record<string, unknown>).onError === "function") {
      (chart as unknown as { onError: (fn: (err: unknown) => void) => void }).onError((err: unknown) => {
        settle(new Error(`TradingView error for ${tvSymbol}: ${String(err)}`));
      });
    }

    chart.onUpdate(() => {
      try {
        const periods = normalizePeriods((chart as { periods?: unknown }).periods);
        if (periods.length < count) {
          return;
        }

        const candles = candlesFromPeriods(periods, count);
        settle(candles);
      } catch (error) {
        settle(error instanceof Error ? error : new Error(String(error)));
      }
    });

    chart.setMarket(tvSymbol, { timeframe, range: Math.max(count, 3) });
  });
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
