import { log } from "./log";
import { buildMessage } from "./messages";
import { evaluateSignals } from "./signals";
import { filterClosedCandles } from "./time";
import { formatTime, formatTimeframe } from "./format";
import { Candle, Settings, State, SymbolEntry, SymbolResult } from "./types";

export function processCandles(args: {
  entry: SymbolEntry;
  tvSymbol: string;
  timeframe: string;
  timeframeSeconds: number | null;
  settings: Settings;
  state: State;
  candles: Candle[];
  shouldEvaluate?: (previous: Candle, current: Candle) => boolean;
  nowSeconds?: number;
}): SymbolResult {
  const { entry, tvSymbol, timeframe, timeframeSeconds, settings, state, candles, shouldEvaluate } = args;

  if (candles.length < 2) {
    log.warn(`Not enough candles for ${tvSymbol}`);
    return { patterns: 0, messages: [] };
  }

  const nowSeconds = args.nowSeconds ?? Math.floor(Date.now() / 1000);
  const closedCandles = filterClosedCandles(candles, timeframeSeconds, nowSeconds);
  log.debug(`${tvSymbol}: ${closedCandles.length} closed candles out of ${candles.length} total`);

  if (closedCandles.length < 2) {
    log.warn(`Not enough closed candles for ${tvSymbol}`);
    return { patterns: 0, messages: [] };
  }

  const stateKey = `${tvSymbol}|${timeframe}`;
  const lastChecked = state[stateKey]?.lastChecked ?? 0;
  const timeframeLabel = formatTimeframe(timeframe);
  let latestCheckedTime = lastChecked;
  let patternsFound = 0;
  const messages: string[] = [];
  const firstRun = lastChecked === 0;
  const startIndex = firstRun ? closedCandles.length - 1 : 1;

  if (firstRun) {
    log.info(`${tvSymbol}: first run — evaluating only the latest closed pair`);
  } else {
    log.debug(
      `${tvSymbol}: lastChecked=${formatTime(lastChecked, settings.timezone)}`
    );
  }

  for (let i = startIndex; i < closedCandles.length; i++) {
    const previous = closedCandles[i - 1];
    const current = closedCandles[i];

    if (!firstRun && lastChecked >= current.time) {
      log.debug(
        `Skipping already-checked pair ${tvSymbol}: ${formatTime(current.time, settings.timezone)}`
      );
      continue;
    }

    log.debug(
      `Evaluating ${tvSymbol} ${timeframeLabel} prev:${formatTime(previous.time, settings.timezone)} curr:${formatTime(current.time, settings.timezone)} ${settings.timezone}`
    );

    if (shouldEvaluate && !shouldEvaluate(previous, current)) {
      log.debug(
        `Skipping filtered pair ${tvSymbol}: ${formatTime(previous.time, settings.timezone)} -> ${formatTime(current.time, settings.timezone)}`
      );
      if (current.time > latestCheckedTime) {
        latestCheckedTime = current.time;
      }
      continue;
    }

    const signals = evaluateSignals(previous, current);

    if (signals.length > 0) {
      log.info(`SIGNAL DETECTED: ${tvSymbol} — ${signals.map((s) => s.label).join(", ")}`);
      for (const signal of signals) {
        messages.push(
          buildMessage({
            entry,
            tvSymbol,
            timeframeLabel,
            previous,
            current,
            timeZone: settings.timezone,
            signal,
            defaultExchange: settings.defaultExchange
          })
        );
      }

      patternsFound += signals.length;
      state[stateKey] = {
        ...state[stateKey],
        lastAlert: current.time
      };
    } else {
      log.debug(`No EBP for ${tvSymbol} at ${formatTime(current.time, settings.timezone)}`);
    }

    if (current.time > latestCheckedTime) {
      latestCheckedTime = current.time;
    }
  }

  state[stateKey] = {
    ...state[stateKey],
    lastChecked: latestCheckedTime
  };

  return { patterns: patternsFound, messages };
}
