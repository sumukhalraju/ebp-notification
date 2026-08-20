import { promises as fs } from "fs";
import path from "path";
import cron from "node-cron";
import { DEFAULT_H7_ANCHOR_HOURS, DEFAULT_H7_TRANSITIONS } from "./h7";
import { isValidTimeZone } from "./time";
import { HourPair, Settings, SymbolEntry, SymbolsConfig } from "./types";

const CONFIG_DIR = path.join(process.cwd(), "config");
export const SETTINGS_PATH = path.join(CONFIG_DIR, "settings.json");
export const SYMBOLS_PATH = path.join(CONFIG_DIR, "symbols.json");

export const DEFAULT_SETTINGS: Settings = {
  timeframe: "240",
  timezone: "America/New_York",
  cron: "1 */4 * * *",
  defaultExchange: "CME_MINI",
  runOnStartup: true,
  h7: false,
  h7Cron: "1 1,8 * * *",
  h7AnchorHours: [...DEFAULT_H7_ANCHOR_HOURS],
  h7Transitions: DEFAULT_H7_TRANSITIONS.map((pair) => [pair[0], pair[1]]),
  lookbackDays: 2,
  fetchConcurrency: 2,
  failureAlertThreshold: 3
};

async function readJson<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

function assertHourList(value: unknown, field: string): number[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Invalid settings: ${field} must be a non-empty array of hours 0-23`);
  }
  for (const item of value) {
    if (typeof item !== "number" || !Number.isInteger(item) || item < 0 || item > 23) {
      throw new Error(`Invalid settings: ${field} must contain integers 0-23`);
    }
  }
  return value;
}

function assertTransitions(value: unknown): HourPair[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("Invalid settings: h7Transitions must be a non-empty array of [from, to] hour pairs");
  }
  const pairs: HourPair[] = [];
  for (const item of value) {
    if (
      !Array.isArray(item) ||
      item.length !== 2 ||
      item.some((hour) => typeof hour !== "number" || !Number.isInteger(hour) || hour < 0 || hour > 23)
    ) {
      throw new Error("Invalid settings: h7Transitions must be [from, to] integer hour pairs (0-23)");
    }
    pairs.push([item[0], item[1]]);
  }
  return pairs;
}

export function parseSymbolEntry(entry: string | SymbolEntry): SymbolEntry {
  if (typeof entry === "string") {
    if (!entry.trim()) {
      throw new Error("Invalid symbol entry: empty string");
    }
    if (entry.includes(":")) {
      const [exchange, symbol] = entry.split(":", 2);
      if (!symbol || !exchange) {
        throw new Error(`Invalid symbol entry: "${entry}"`);
      }
      return { symbol, exchange };
    }
    return { symbol: entry };
  }

  if (typeof entry !== "object" || entry === null) {
    throw new Error(`Invalid symbol entry: expected string or object, got ${typeof entry}`);
  }

  let { symbol, exchange } = entry;

  if (!symbol || typeof symbol !== "string" || !symbol.trim()) {
    throw new Error("Invalid symbol entry: missing or empty symbol");
  }

  if (symbol.includes(":") && !exchange) {
    const parts = symbol.split(":", 2);
    exchange = parts[0];
    symbol = parts[1];
    if (!symbol || !exchange) {
      throw new Error(`Invalid symbol entry: malformed symbol "${entry.symbol}"`);
    }
    return { ...entry, symbol, exchange };
  }

  return entry;
}

export function normalizeSettings(fileSettings: Partial<Settings>): Settings {
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    ...fileSettings,
    h7AnchorHours: fileSettings.h7AnchorHours ?? [...DEFAULT_H7_ANCHOR_HOURS],
    h7Transitions: fileSettings.h7Transitions ?? DEFAULT_H7_TRANSITIONS.map((pair) => [pair[0], pair[1]])
  };

  if (!settings.timeframe || typeof settings.timeframe !== "string") {
    throw new Error("Invalid settings: timeframe must be a non-empty string");
  }

  if (!settings.timezone || typeof settings.timezone !== "string" || !isValidTimeZone(settings.timezone)) {
    throw new Error("Invalid settings: timezone must be a valid IANA time zone");
  }

  if (!settings.cron || typeof settings.cron !== "string" || !cron.validate(settings.cron)) {
    throw new Error(`Invalid settings: cron is not a valid cron expression: "${settings.cron}"`);
  }

  if (settings.h7Cron && !cron.validate(settings.h7Cron)) {
    throw new Error(`Invalid settings: h7Cron is not a valid cron expression: "${settings.h7Cron}"`);
  }

  if (settings.heartbeatCron && !cron.validate(settings.heartbeatCron)) {
    throw new Error(`Invalid settings: heartbeatCron is not a valid cron expression: "${settings.heartbeatCron}"`);
  }

  settings.h7AnchorHours = assertHourList(settings.h7AnchorHours, "h7AnchorHours");
  settings.h7Transitions = assertTransitions(settings.h7Transitions);

  if (typeof settings.lookbackDays !== "number" || !Number.isFinite(settings.lookbackDays) || settings.lookbackDays <= 0) {
    throw new Error("Invalid settings: lookbackDays must be a positive number");
  }

  if (
    typeof settings.fetchConcurrency !== "number" ||
    !Number.isInteger(settings.fetchConcurrency) ||
    settings.fetchConcurrency < 1 ||
    settings.fetchConcurrency > 10
  ) {
    throw new Error("Invalid settings: fetchConcurrency must be an integer 1-10");
  }

  if (
    typeof settings.failureAlertThreshold !== "number" ||
    !Number.isInteger(settings.failureAlertThreshold) ||
    settings.failureAlertThreshold < 1
  ) {
    throw new Error("Invalid settings: failureAlertThreshold must be an integer >= 1");
  }

  return settings;
}

export async function loadSettings(): Promise<Settings> {
  const fileSettings = await readJson<Partial<Settings>>(SETTINGS_PATH);
  return normalizeSettings(fileSettings);
}

export async function loadSymbols(): Promise<SymbolEntry[]> {
  const config = await readJson<SymbolsConfig>(SYMBOLS_PATH);
  if (!config || typeof config !== "object" || !Array.isArray((config as SymbolsConfig).symbols)) {
    throw new Error("Invalid symbols config: expected an object with a symbols array");
  }
  if (config.symbols.length === 0) {
    throw new Error("No symbols found in config/symbols.json");
  }

  return config.symbols.map(parseSymbolEntry);
}

export function toTvSymbol(entry: SymbolEntry, defaultExchange?: string): string {
  const exchange = entry.exchange ?? defaultExchange;
  if (exchange) {
    return `${exchange}:${entry.symbol}`;
  }
  return entry.symbol;
}

export function displayName(entry: SymbolEntry, defaultExchange?: string): string {
  return entry.name ?? toTvSymbol(entry, defaultExchange);
}
