import { displayName } from "./config";
import { formatPrice, formatTime, formatTimeframe } from "./format";
import { Signal } from "./signals";
import { Candle, RunResult, Settings, SymbolEntry } from "./types";

export function padRight(str: string, len: number): string {
  return str.padEnd(len, " ");
}

function formatOHLC(candle: Candle): string {
  return [
    `O ${formatPrice(candle.open)}`,
    `H ${formatPrice(candle.high)}`,
    `L ${formatPrice(candle.low)}`,
    `C ${formatPrice(candle.close)}`
  ].join(" · ");
}

export function buildMessage(args: {
  entry: SymbolEntry;
  tvSymbol: string;
  timeframeLabel: string;
  previous: Candle;
  current: Candle;
  timeZone: string;
  signal: Signal;
  defaultExchange?: string;
}): string {
  const name = displayName(args.entry, args.defaultExchange);
  const lines = [
    `${name} (${args.tvSymbol}) — ${args.signal.id === "sweep_low" ? "Low sweep" : "High sweep"}`,
    `${args.timeframeLabel} · ${formatTime(args.current.time, args.timeZone)} ${args.timeZone}`,
    "",
    `Previous: ${formatOHLC(args.previous)}`,
    `Current:  ${formatOHLC(args.current)}`
  ];

  return lines.join("\n");
}

export function buildRunSummary(results: RunResult[], settings: Settings, timeframeLabel?: string): string {
  const totalPatterns = results.reduce((sum, r) => sum + r.patterns, 0);
  const now = new Date();
  const timeStr = now.toLocaleString("en-US", { timeZone: settings.timezone, hour12: true });
  const maxSymLen = results.length === 0 ? 8 : Math.max(...results.map((r) => r.symbol.length), 8);
  const tfLabel = timeframeLabel ?? formatTimeframe(settings.timeframe);
  const lines = [
    `EBP ${tfLabel} · ${timeStr} ${settings.timezone}`
  ];

  for (const r of results) {
    if (r.error) {
      lines.push(`${padRight(r.symbol, maxSymLen)} · ERROR — ${r.error}`);
    } else if (r.patterns > 0) {
      lines.push(`${padRight(r.symbol, maxSymLen)} · ${r.patterns} signal(s)`);
    }
  }

  lines.push(`Total: ${totalPatterns} signal(s) across ${results.length} symbol(s)`);
  return lines.join("\n");
}
