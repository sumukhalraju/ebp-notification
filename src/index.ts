import "dotenv/config";
import { watch } from "fs";
import path from "path";
import cron from "node-cron";
import { loadSettings, loadSymbols, toTvSymbol, SETTINGS_PATH } from "./config";
import { formatTimeframe } from "./format";
import { DEFAULT_H7_ANCHOR_HOURS, DEFAULT_H7_TRANSITIONS, H7_TIMEFRAME, isH7Transition } from "./h7";
import { log } from "./log";
import { buildRunSummary, padRight } from "./messages";
import { getTargets, sendNotifications } from "./notify";
import { mapPool } from "./pool";
import { fetchCandles, fetchCandlesH7 } from "./providers/tradingview";
import { processCandles } from "./scan";
import { loadState, saveState, withStateLock } from "./state";
import { candleFetchCount, timeframeToSeconds } from "./time";
import { RunResult, Settings, State, SymbolEntry, SymbolResult } from "./types";

let running = false;
let runningH7 = false;
let shuttingDown = false;
let consecutiveFailures = 0;
let scheduleSignature = "";
let baseTask: cron.ScheduledTask | undefined;
let h7Task: cron.ScheduledTask | undefined;
let heartbeatTask: cron.ScheduledTask | undefined;
let settingsWatcher: ReturnType<typeof watch> | undefined;
let watchDebounce: NodeJS.Timeout | undefined;

type CheckResults = {
  results: RunResult[];
  messages: string[];
};

function scheduleKey(settings: Settings): string {
  return [
    settings.cron,
    settings.timezone,
    String(Boolean(settings.h7)),
    settings.h7Cron ?? "",
    settings.heartbeatCron ?? ""
  ].join("|");
}

async function processSymbol(entry: SymbolEntry, settings: Settings, state: State): Promise<SymbolResult> {
  const tvSymbol = toTvSymbol(entry, settings.defaultExchange);
  const timeframeSeconds = timeframeToSeconds(settings.timeframe);
  const fetchCount = candleFetchCount(timeframeSeconds, settings.lookbackDays ?? 2, 10);
  log.info(`Fetching ${fetchCount} candles for ${tvSymbol} (${settings.timeframe}min)...`);
  const candles = await fetchCandles(tvSymbol, settings.timeframe, fetchCount);
  log.info(`Fetched ${candles.length} candles for ${tvSymbol}`);
  return processCandles({
    entry,
    tvSymbol,
    timeframe: settings.timeframe,
    timeframeSeconds,
    settings,
    state,
    candles
  });
}

async function processH7Symbol(entry: SymbolEntry, settings: Settings, state: State): Promise<SymbolResult> {
  const tvSymbol = toTvSymbol(entry, settings.defaultExchange);
  const h7Seconds = timeframeToSeconds(H7_TIMEFRAME);
  const fetchCount = candleFetchCount(h7Seconds, settings.lookbackDays ?? 2, 8);
  const anchorHours = settings.h7AnchorHours ?? DEFAULT_H7_ANCHOR_HOURS;
  const transitions = settings.h7Transitions ?? DEFAULT_H7_TRANSITIONS;

  log.info(`Fetching H7 candles for ${tvSymbol} (${formatTimeframe(H7_TIMEFRAME)})...`);
  const candles = await fetchCandlesH7(tvSymbol, settings.timezone, fetchCount, anchorHours);
  log.info(`Fetched ${candles.length} H7 candles for ${tvSymbol}`);

  return processCandles({
    entry,
    tvSymbol,
    timeframe: H7_TIMEFRAME,
    timeframeSeconds: h7Seconds,
    settings,
    state,
    candles,
    shouldEvaluate: (previous, current) => isH7Transition(previous, current, settings.timezone, transitions)
  });
}

async function runSymbolBatch(
  settings: Settings,
  state: State,
  processor: (entry: SymbolEntry, settings: Settings, state: State) => Promise<SymbolResult>,
  label: string
): Promise<CheckResults> {
  const symbols = await loadSymbols();
  const concurrency = settings.fetchConcurrency ?? 2;
  const batch = await mapPool(symbols, concurrency, async (entry) => {
    const tvSymbol = toTvSymbol(entry, settings.defaultExchange);
    try {
      const result = await processor(entry, settings, state);
      return {
        run: { symbol: tvSymbol, patterns: result.patterns } satisfies RunResult,
        messages: result.messages
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error(`Error processing ${label} ${tvSymbol}`, error);
      return {
        run: { symbol: tvSymbol, patterns: 0, error: msg } satisfies RunResult,
        messages: [] as string[]
      };
    }
  });

  return {
    results: batch.map((item) => item.run),
    messages: batch.flatMap((item) => item.messages)
  };
}

function assertScanSucceeded(results: RunResult[], label: string): void {
  if (results.length > 0 && results.every((result) => result.error)) {
    throw new Error(`All ${results.length} ${label} symbol(s) failed: ${results.map((r) => r.error).join("; ")}`);
  }
}

async function runCheck(): Promise<CheckResults> {
  if (running) {
    log.error("SKIPPED: Previous 4H run still in progress, skipping this scheduled check");
    return { results: [], messages: [] };
  }

  running = true;
  try {
    return await withStateLock(async () => {
      const settings = await loadSettings();
      const state = await loadState();
      const output = await runSymbolBatch(settings, state, processSymbol, "4H");
      await saveState(state);
      assertScanSucceeded(output.results, "4H");
      return output;
    });
  } finally {
    running = false;
  }
}

async function runH7Check(): Promise<CheckResults> {
  if (runningH7) {
    log.error("SKIPPED: Previous H7 run still in progress");
    return { results: [], messages: [] };
  }

  runningH7 = true;
  try {
    return await withStateLock(async () => {
      const settings = await loadSettings();
      if (!settings.h7) {
        return { results: [], messages: [] };
      }
      const state = await loadState();
      const output = await runSymbolBatch(settings, state, processH7Symbol, "H7");
      await saveState(state);
      assertScanSucceeded(output.results, "H7");
      return output;
    });
  } finally {
    runningH7 = false;
  }
}

async function runAndNotify(): Promise<void> {
  log.info("Running EBP scan...");
  const settings = await loadSettings();
  const { results, messages } = await runCheck();

  if (results.length === 0) {
    log.info("Scan skipped (no results)");
    return;
  }

  const summary = buildRunSummary(results, settings);
  log.info(summary.replace(/\n/g, " | "));
  const total = results.reduce((sum, r) => sum + r.patterns, 0);
  if (total > 0) {
    await sendNotifications([summary, ...messages].join("\n\n"));
  }
}

async function runH7AndNotify(): Promise<void> {
  log.info("Running H7 scan...");
  const settings = await loadSettings();
  const { results, messages } = await runH7Check();

  if (results.length === 0) {
    log.info("H7 scan skipped (no results or H7 disabled)");
    return;
  }

  const summary = buildRunSummary(results, settings, formatTimeframe(H7_TIMEFRAME));
  log.info(summary.replace(/\n/g, " | "));
  const total = results.reduce((sum, r) => sum + r.patterns, 0);
  if (total > 0) {
    await sendNotifications([summary, ...messages].join("\n\n"));
  }
}

async function sendHeartbeat(): Promise<void> {
  const settings = await loadSettings();
  const symbols = await loadSymbols();
  const timeStr = new Date().toLocaleString("en-US", { timeZone: settings.timezone, hour12: true });
  await sendNotifications(
    [
      "EBP heartbeat",
      `${timeStr} ${settings.timezone}`,
      `Timeframe: ${formatTimeframe(settings.timeframe)}${settings.h7 ? " + H7" : ""}`,
      `Symbols: ${symbols.map((s) => toTvSymbol(s, settings.defaultExchange)).join(", ")}`,
      "Bot is running."
    ].join("\n")
  );
}

async function guardedRun(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    consecutiveFailures = 0;
  } catch (error) {
    consecutiveFailures += 1;
    log.error(`${label} failed (${consecutiveFailures} consecutive)`, error);
    try {
      const settings = await loadSettings();
      const threshold = settings.failureAlertThreshold ?? 3;
      if (consecutiveFailures >= threshold) {
        const msg = error instanceof Error ? error.message : String(error);
        await sendNotifications(`EBP ${label} failed ${consecutiveFailures} times in a row.\n${msg}`);
      }
    } catch (notifyError) {
      log.error("Failure alert could not be sent", notifyError);
    }
  }
}

function stopSchedulers(): void {
  baseTask?.stop();
  h7Task?.stop();
  heartbeatTask?.stop();
  baseTask = undefined;
  h7Task = undefined;
  heartbeatTask = undefined;
}

function startSchedulers(settings: Settings): void {
  stopSchedulers();

  baseTask = cron.schedule(
    settings.cron,
    () => {
      void guardedRun("4H scan", runAndNotify);
    },
    { timezone: settings.timezone }
  );

  if (settings.h7) {
    const h7Cron = settings.h7Cron ?? "1 1,8 * * *";
    h7Task = cron.schedule(
      h7Cron,
      () => {
        void guardedRun("H7 scan", runH7AndNotify);
      },
      { timezone: settings.timezone }
    );
    log.info(`H7 scheduler started with cron ${h7Cron} (${settings.timezone})`);
  }

  if (settings.heartbeatCron) {
    heartbeatTask = cron.schedule(
      settings.heartbeatCron,
      () => {
        void guardedRun("heartbeat", sendHeartbeat);
      },
      { timezone: settings.timezone }
    );
    log.info(`Heartbeat scheduler started with cron ${settings.heartbeatCron} (${settings.timezone})`);
  }

  scheduleSignature = scheduleKey(settings);
  log.info(`Base scheduler started with cron ${settings.cron} (${settings.timezone})`);
}

async function reloadSchedulers(): Promise<void> {
  try {
    const settings = await loadSettings();
    const next = scheduleKey(settings);
    if (next === scheduleSignature) {
      log.debug("Settings reloaded, schedule unchanged");
      return;
    }
    log.info("Settings changed, rescheduling");
    startSchedulers(settings);
  } catch (error) {
    log.error("Failed to reload settings", error);
  }
}

function watchSettings(): void {
  const configDir = path.dirname(SETTINGS_PATH);
  settingsWatcher = watch(configDir, () => {
    if (watchDebounce) {
      clearTimeout(watchDebounce);
    }
    watchDebounce = setTimeout(() => {
      void reloadSchedulers();
    }, 400);
  });
}

async function waitForInFlight(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while ((running || runningH7) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  log.info(`Received ${signal}, shutting down...`);
  stopSchedulers();
  settingsWatcher?.close();
  await waitForInFlight(20000);
  if (running || runningH7) {
    log.warn("Timed out waiting for in-flight scan");
  }
  process.exit(0);
}

async function sendStartupNotification(settings: Settings, symbols: SymbolEntry[]): Promise<void> {
  const labelW = 12;
  await sendNotifications(
    [
      "═══════════════════════════════════",
      "EBP Bot Started",
      "═══════════════════════════════════",
      "",
      `${padRight("Timeframe", labelW)} : ${formatTimeframe(settings.timeframe)}${settings.h7 ? " + H7" : ""}`,
      `${padRight("Schedule", labelW)} : ${settings.cron}  (${settings.timezone})`,
      `${padRight("Symbols", labelW)} : ${symbols.map((s) => toTvSymbol(s, settings.defaultExchange)).join(", ")}`,
      "═══════════════════════════════════"
    ].join("\n")
  );
}

async function main(): Promise<void> {
  const settings = await loadSettings();
  const symbols = await loadSymbols();
  const runOnce = process.argv.includes("--once");
  const targets = getTargets();

  log.info("=== EBP Notification Service ===");
  log.info(
    `Settings: timeframe=${settings.timeframe}min zone=${settings.timezone} cron="${settings.cron}"${settings.h7 ? " H7=enabled" : ""}`
  );
  log.info(`Symbols: ${symbols.map((s) => toTvSymbol(s, settings.defaultExchange)).join(", ")}`);
  log.info(`Telegram: ${targets.telegramToken && targets.telegramChatId ? "configured" : "MISSING"}`);
  log.info(`Discord:  ${targets.discordWebhookUrl ? "configured" : "not set"}`);
  log.info(`DRY_RUN:  ${targets.dryRun ? "ON — notifications DISABLED" : "off"}`);
  log.info(`Run mode: ${runOnce ? "once" : "scheduled"}`);
  log.info("================================");

  if (runOnce) {
    await runAndNotify();
    const latest = await loadSettings();
    if (latest.h7) {
      await runH7AndNotify();
    }
    return;
  }

  await sendStartupNotification(settings, symbols);
  startSchedulers(settings);
  watchSettings();

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  if (settings.runOnStartup) {
    await guardedRun("4H scan", runAndNotify);
    const latest = await loadSettings();
    if (latest.h7) {
      await guardedRun("H7 scan", runH7AndNotify);
    }
  }
}

process.on("unhandledRejection", (reason) => {
  log.error("Unhandled promise rejection", reason);
});

process.on("uncaughtException", (error) => {
  log.error("Uncaught exception", error);
  process.exitCode = 1;
});

main().catch((error) => {
  log.error("Fatal error", error);
  process.exitCode = 1;
});
