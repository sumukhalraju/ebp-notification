import "dotenv/config";
import cron from "node-cron";
import { displayName, loadSettings, loadSymbols, toTvSymbol } from "./config";
import { formatPrice, formatTime, formatTimeframe } from "./format";
import { sendNotifications, getTargets } from "./notify";
import { fetchCandles } from "./providers/tradingview";
import { loadState, saveState } from "./state";
import { Candle, Settings, State, SymbolEntry } from "./types";

type Signal = {
  id: "sweep_low" | "sweep_high";
  label: string;
};

type RunResult = {
  symbol: string;
  patterns: number;
  error?: string;
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

function padRight(str: string, len: number): string {
  return str.padEnd(len, " ");
}

function formatOHLC(label: string, o: number, h: number, l: number, c: number): string {
  const pad = 9;
  return [
    `${label}`,
    `  Open  : ${padRight(formatPrice(o), pad)}`,
    `  High  : ${padRight(formatPrice(h), pad)}`,
    `  Low   : ${padRight(formatPrice(l), pad)}`,
    `  Close : ${formatPrice(c)}`
  ].join("\n");
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
  const labelWidth = 12;
  const lines = [
    "═══════════════════════════════════",
    `${padRight("Symbol", labelWidth)}: ${name} (${tvSymbol})`,
    `${padRight("Timeframe", labelWidth)}: ${timeframeLabel}`,
    `${padRight("Signal", labelWidth)}: ${signal.label}`,
    `${padRight("Time", labelWidth)}: ${formatTime(current.time, timeZone)}  ${timeZone}`,
    "",
    formatOHLC("Previous Candle:", previous.open, previous.high, previous.low, previous.close),
    "",
    formatOHLC("Current Candle:", current.open, current.high, current.low, current.close),
    "═══════════════════════════════════"
  ];

  return lines.join("\n");
}

async function processSymbol(entry: SymbolEntry, settings: Settings, state: State): Promise<number> {
  const tvSymbol = toTvSymbol(entry, settings.defaultExchange);
  const timeframeSeconds = timeframeToSeconds(settings.timeframe);
  const fetchCount = timeframeSeconds !== null ? Math.ceil(86400 / timeframeSeconds) + 2 : 10;
  console.log(`Fetching ${fetchCount} candles for ${tvSymbol} (${settings.timeframe}min)...`);
  const candles = await fetchCandles(tvSymbol, settings.timeframe, fetchCount);
  console.log(`Fetched ${candles.length} candles for ${tvSymbol}`);

  if (candles.length < 2) {
    console.warn(`Not enough candles for ${tvSymbol}`);
    return 0;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const closedCandles = candles.filter((candle, index) => {
    if (timeframeSeconds !== null) {
      return nowSeconds >= candle.time + timeframeSeconds;
    }
    return index < candles.length - 1;
  });
  console.log(`${tvSymbol}: ${closedCandles.length} closed candles out of ${candles.length} total`);

  if (closedCandles.length < 2) {
    console.warn(`Not enough closed candles for ${tvSymbol}`);
    return 0;
  }

  const stateKey = `${tvSymbol}|${settings.timeframe}`;
  const lastChecked = state[stateKey]?.lastChecked ?? 0;
  const timeframeLabel = formatTimeframe(settings.timeframe);
  let latestCheckedTime = lastChecked;
  let patternsFound = 0;

  console.log(`${tvSymbol}: lastChecked=${lastChecked === 0 ? "never" : formatTime(lastChecked, settings.timezone)}`);

  for (let i = 1; i < closedCandles.length; i++) {
    const previous = closedCandles[i - 1];
    const current = closedCandles[i];

    if (lastChecked >= current.time) {
      console.log(`Skipping already-checked pair ${tvSymbol}: ${formatTime(current.time, settings.timezone)}`);
      continue;
    }

    console.log(
      `Evaluating ${tvSymbol} ${timeframeLabel} prev:${formatTime(previous.time, settings.timezone)} curr:${formatTime(current.time, settings.timezone)} ${settings.timezone}`
    );

    const signals = evaluateSignals(previous, current);

    if (signals.length > 0) {
      console.log(`SIGNAL DETECTED: ${tvSymbol} — ${signals.map(s => s.label).join(", ")}`);
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

      patternsFound += signals.length;

      state[stateKey] = {
        ...state[stateKey],
        lastAlert: current.time
      };
    } else {
      console.log(`No EBP for ${tvSymbol} at ${formatTime(current.time, settings.timezone)}`);
    }

    if (current.time > latestCheckedTime) {
      latestCheckedTime = current.time;
    }
  }

  state[stateKey] = {
    ...state[stateKey],
    lastChecked: latestCheckedTime
  };

  return patternsFound;
}

async function runCheck(): Promise<RunResult[]> {
  const results: RunResult[] = [];

  if (running) {
    console.error("SKIPPED: Previous run still in progress, skipping this scheduled check");
    return results;
  }

  running = true;
  try {
    const settings = await loadSettings();
    const symbols = await loadSymbols();
    const state = await loadState();

    for (const entry of symbols) {
      const tvSymbol = toTvSymbol(entry, settings.defaultExchange);
      try {
        const patterns = await processSymbol(entry, settings, state);
        results.push({ symbol: tvSymbol, patterns });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        results.push({ symbol: tvSymbol, patterns: 0, error: msg });
        console.error(`Error processing ${tvSymbol}`, error);
      }
    }

    await saveState(state);
  } finally {
    running = false;
  }

  return results;
}

function buildRunSummary(results: RunResult[], settings: Settings): string {
  const totalPatterns = results.reduce((sum, r) => sum + r.patterns, 0);
  const now = new Date();
  const timeStr = now.toLocaleString("en-US", { timeZone: settings.timezone, hour12: true });

  const maxSymLen = Math.max(...results.map(r => r.symbol.length), 8);
  const lines = [
    "─────────────────────────────────────",
    `EBP ${formatTimeframe(settings.timeframe)} Scan — ${timeStr} ${settings.timezone}`,
    "",
  ];

  for (const r of results) {
    if (r.error) {
      lines.push(`  ${padRight(r.symbol, maxSymLen)} : ERROR — ${r.error}`);
    } else if (r.patterns > 0) {
      lines.push(`  ${padRight(r.symbol, maxSymLen)} : ${r.patterns} signal(s)`);
    } else {
      lines.push(`  ${padRight(r.symbol, maxSymLen)} : no EBP detected`);
    }
  }

  lines.push("");
  lines.push(`Total: ${totalPatterns} signal(s) across ${results.length} symbol(s)`);
  lines.push("─────────────────────────────────────");
  return lines.join("\n");
}

async function runAndNotify(settings: Settings): Promise<void> {
  console.log(`[${new Date().toISOString()}] Running EBP scan...`);
  const results = await runCheck();

  if (results.length === 0) {
    console.log("Scan skipped (no results)");
    return;
  }

  const summary = buildRunSummary(results, settings);
  console.log(summary.replace(/\n/g, " | "));
  await sendNotifications(summary);
}

async function main(): Promise<void> {
  const settings = await loadSettings();
  const symbols = await loadSymbols();
  const runOnce = process.argv.includes("--once");

  // --- Startup diagnostics ---
  const targets = getTargets();
  console.log("=== EBP Notification Service ===");
  console.log(`Settings: timeframe=${settings.timeframe}min zone=${settings.timezone} cron="${settings.cron}"`);
  console.log(`Symbols: ${symbols.map(s => toTvSymbol(s, settings.defaultExchange)).join(", ")}`);
  console.log(`Telegram: ${targets.telegramToken && targets.telegramChatId ? "configured" : "MISSING"}`);
  console.log(`Discord:  ${targets.discordWebhookUrl ? "configured" : "not set"}`);
  console.log(`DRY_RUN:  ${targets.dryRun ? "ON — notifications DISABLED" : "off"}`);
  console.log(`Run mode: ${runOnce ? "once" : "scheduled"}`);
  console.log("================================");

  if (runOnce) {
    await runAndNotify(settings);
    return;
  }

  // Startup notification
  const labelW = 12;
  await sendNotifications(
    [
      "═══════════════════════════════════",
      "EBP Bot Started",
      "═══════════════════════════════════",
      "",
      `${padRight("Timeframe", labelW)} : ${formatTimeframe(settings.timeframe)}`,
      `${padRight("Schedule", labelW)} : ${settings.cron}  (${settings.timezone})`,
      `${padRight("Symbols", labelW)} : ${symbols.map(s => toTvSymbol(s, settings.defaultExchange)).join(", ")}`,
      "═══════════════════════════════════"
    ].join("\n")
  );

  const task = cron.schedule(
    settings.cron,
    () => {
      void runAndNotify(settings);
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
    void runAndNotify(settings);
  }

  console.log(`Scheduler started with cron ${settings.cron} (${settings.timezone})`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
