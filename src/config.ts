import { promises as fs } from "fs";
import path from "path";
import { Settings, SymbolsConfig, SymbolEntry } from "./types";

const CONFIG_DIR = path.join(process.cwd(), "config");
export const SETTINGS_PATH = path.join(CONFIG_DIR, "settings.json");
export const SYMBOLS_PATH = path.join(CONFIG_DIR, "symbols.json");

const DEFAULT_SETTINGS: Settings = {
  timeframe: "240",
  timezone: "America/Chicago",
  cron: "1 */4 * * *",
  defaultExchange: "CME_MINI",
  runOnStartup: true
};

async function readJson<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

function parseSymbolEntry(entry: string | SymbolEntry): SymbolEntry {
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

export async function loadSettings(): Promise<Settings> {
  const fileSettings = await readJson<Partial<Settings>>(SETTINGS_PATH);
  const settings = { ...DEFAULT_SETTINGS, ...fileSettings };

  if (!settings.timeframe || typeof settings.timeframe !== "string") {
    throw new Error("Invalid settings: timeframe must be a non-empty string");
  }

  if (!settings.timezone || typeof settings.timezone !== "string") {
    throw new Error("Invalid settings: timezone must be a non-empty string");
  }

  if (!settings.cron || typeof settings.cron !== "string") {
    throw new Error("Invalid settings: cron must be a non-empty string");
  }

  return settings;
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
