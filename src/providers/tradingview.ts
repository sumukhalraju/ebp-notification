import TradingView from "@mathieuc/tradingview";
import { Candle } from "../types";

type Period = {
  time: number;
  open: number;
  high: number;
  low: number;
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

export async function fetchCandles(tvSymbol: string, timeframe: string, count: number): Promise<Candle[]> {
  const client = new TradingView.Client();
  const chart = new client.Session.Chart();

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
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
      reject(new Error(`Timeout fetching candles for ${tvSymbol}`));
    }, 15000);

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

    chart.onUpdate(() => {
      const periods = normalizePeriods((chart as { periods?: unknown }).periods);
      if (periods.length < count) {
        return;
      }

      const candles = periods
        .map((period) => ({
          time: Number(period.time),
          open: Number(period.open),
          high: Number(period.high),
          low: Number(period.low),
          close: Number(period.close),
          volume: period.volume === undefined ? undefined : Number(period.volume)
        }))
        .filter((period) => Number.isFinite(period.time))
        .sort((a, b) => a.time - b.time)
        .slice(-count);

      cleanup();
      resolve(candles);
    });

    chart.setMarket(tvSymbol, { timeframe, range: Math.max(count, 3) });
  });
}
