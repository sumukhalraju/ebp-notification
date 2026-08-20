import { displayName } from "./config";
import { formatPrice, formatTime, formatTimeframe } from "./format";
import { Signal } from "./signals";
import { Candle, RunResult, Settings, SymbolEntry } from "./types";

export function padRight(str: string, len: number): string {
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
  const labelWidth = 12;
  const lines = [
    "═══════════════════════════════════",
    `${padRight("Symbol", labelWidth)}: ${name} (${args.tvSymbol})`,
    `${padRight("Timeframe", labelWidth)}: ${args.timeframeLabel}`,
    `${padRight("Signal", labelWidth)}: ${args.signal.label}`,
    `${padRight("Time", labelWidth)}: ${formatTime(args.current.time, args.timeZone)}  ${args.timeZone}`,
    "",
    formatOHLC(
      "Previous Candle:",
      args.previous.open,
      args.previous.high,
      args.previous.low,
      args.previous.close
    ),
    "",
    formatOHLC("Current Candle:", args.current.open, args.current.high, args.current.low, args.current.close),
    "═══════════════════════════════════"
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
    "─────────────────────────────────────",
    `EBP ${tfLabel} Scan — ${timeStr} ${settings.timezone}`,
    ""
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
