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

function timeframeToSeconds(timeframe: string): number | null {
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
  const timeframeSeconds = timeframeToSeconds(settings.timeframe);
  const fetchCount = timeframeSeconds !== null ? Math.ceil(86400 / timeframeSeconds) + 2 : 10;
  const candles = await fetchCandles(tvSymbol, settings.timeframe, fetchCount);

  if (candles.length < 2) {
    console.warn(`Not enough candles for ${tvSymbol}`);
    return;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const closedCandles = candles.filter((candle, index) => {
    if (timeframeSeconds !== null) {
      return nowSeconds >= candle.time + timeframeSeconds;
    }
    return index < candles.length - 1;
  });

  if (closedCandles.length < 2) {
    console.warn(`Not enough closed candles for ${tvSymbol}`);
    return;
  }

  const stateKey = `${tvSymbol}|${settings.timeframe}`;
  const lastChecked = state[stateKey]?.lastChecked ?? 0;
  const timeframeLabel = formatTimeframe(settings.timeframe);
  let latestCheckedTime = lastChecked;

  for (let i = 1; i < closedCandles.length; i++) {
    const previous = closedCandles[i - 1];
    const current = closedCandles[i];

    if (lastChecked >= current.time) {
      continue;
    }

    console.log(
      `Evaluating ${tvSymbol} ${timeframeLabel} prev:${formatTime(previous.time, settings.timezone)} curr:${formatTime(current.time, settings.timezone)} ${settings.timezone}`
    );

    const signals = evaluateSignals(previous, current);

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

    if (current.time > latestCheckedTime) {
      latestCheckedTime = current.time;
    }
  }

  state[stateKey] = {
    ...state[stateKey],
    lastChecked: latestCheckedTime
  };
}

async function runCheck(): Promise<void> {
  if (running) {
    console.error("SKIPPED: Previous run still in progress, skipping this scheduled check");
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

  const task = cron.schedule(
    settings.cron,
    () => {
      void runCheck();
    },
    { timezone: settings.timezone }
  );

  const shutdown = (signal: string) => {
    console.log(`Received ${signal}, shutting down gracefully...`);
    task.stop();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  if (settings.runOnStartup) {
    void runCheck();
  }

  console.log(`Scheduler started with cron ${settings.cron} (${settings.timezone})`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
