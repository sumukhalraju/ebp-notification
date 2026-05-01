import "dotenv/config";
import cron from "node-cron";
import { displayName, loadSettings, loadSymbols, toTvSymbol } from "./config";
import { formatPrice, formatTime, formatTimeframe } from "./format";
import { sendNotifications } from "./notify";
import { fetchCandles } from "./providers/tradingview";
import { loadState, saveState } from "./state";
import { Candle, Settings, State, SymbolEntry } from "./types";

type Signal = {
  id: "sweep_low" | "sweep_high";
  label: string;
};

let running = false;

function evaluateSignals(previous: Candle, current: Candle): Signal[] {
  const signals: Signal[] = [];

  if (current.low < previous.low && current.close > previous.open) {
    signals.push({
      id: "sweep_low",
      label: "Low sweep and close above previous open"
    });
  }

  if (current.high > previous.high && current.close < previous.open) {
    signals.push({
      id: "sweep_high",
      label: "High sweep and close below previous open"
    });
  }

  return signals;
}

function buildMessage(
  entry: SymbolEntry,
  tvSymbol: string,
  timeframeLabel: string,
  previous: Candle,
  current: Candle,
  timeZone: string,
  signal: Signal,
  defaultExchange?: string
): string {
  const name = displayName(entry, defaultExchange);
  const title = entry.name ? `${name} (${tvSymbol}) ${timeframeLabel}` : `${tvSymbol} ${timeframeLabel}`;
  const timeLine = `Candle time: ${formatTime(current.time, timeZone)} ${timeZone}`;
  const previousLine = `Prev O:${formatPrice(previous.open)} H:${formatPrice(previous.high)} L:${formatPrice(previous.low)} C:${formatPrice(previous.close)}`;
  const currentLine = `Curr O:${formatPrice(current.open)} H:${formatPrice(current.high)} L:${formatPrice(current.low)} C:${formatPrice(current.close)}`;

  return [title, signal.label, timeLine, previousLine, currentLine].join("\n");
}

async function processSymbol(entry: SymbolEntry, settings: Settings, state: State): Promise<void> {
  const tvSymbol = toTvSymbol(entry, settings.defaultExchange);
  const candles = await fetchCandles(tvSymbol, settings.timeframe, 3);

  if (candles.length < 2) {
    console.warn(`Not enough candles for ${tvSymbol}`);
    return;
  }

  const previous = candles[candles.length - 2];
  const current = candles[candles.length - 1];
  const stateKey = `${tvSymbol}|${settings.timeframe}`;
  const lastChecked = state[stateKey]?.lastChecked ?? 0;

  if (lastChecked >= current.time) {
    return;
  }

  const signals = evaluateSignals(previous, current);
  const timeframeLabel = formatTimeframe(settings.timeframe);

  if (signals.length > 0) {
    for (const signal of signals) {
      const message = buildMessage(
        entry,
        tvSymbol,
        timeframeLabel,
        previous,
        current,
        settings.timezone,
        signal,
        settings.defaultExchange
      );
      await sendNotifications(message);
    }

    state[stateKey] = {
      ...state[stateKey],
      lastAlert: current.time
    };
  }

  state[stateKey] = {
    ...state[stateKey],
    lastChecked: current.time
  };
}

async function runCheck(): Promise<void> {
  if (running) {
    console.warn("Previous run still in progress, skipping");
    return;
  }

  running = true;
  try {
    const settings = await loadSettings();
    const symbols = await loadSymbols();
    const state = await loadState();

    for (const entry of symbols) {
      try {
        await processSymbol(entry, settings, state);
      } catch (error) {
        console.error(`Error processing ${entry.symbol}`, error);
      }
    }

    await saveState(state);
  } finally {
    running = false;
  }
}

async function main(): Promise<void> {
  const settings = await loadSettings();
  const runOnce = process.argv.includes("--once");

  if (runOnce) {
    await runCheck();
    return;
  }

  cron.schedule(
    settings.cron,
    () => {
      void runCheck();
    },
    { timezone: settings.timezone }
  );

  if (settings.runOnStartup) {
    void runCheck();
  }

  console.log(`Scheduler started with cron ${settings.cron} (${settings.timezone})`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
