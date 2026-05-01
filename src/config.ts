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
    if (entry.includes(":")) {
      const [exchange, symbol] = entry.split(":", 2);
      return { symbol, exchange };
    }
    return { symbol: entry };
  }

  if (entry.symbol.includes(":") && !entry.exchange) {
    const [exchange, symbol] = entry.symbol.split(":", 2);
    return { ...entry, symbol, exchange };
  }

  return entry;
}

export async function loadSettings(): Promise<Settings> {
  const fileSettings = await readJson<Partial<Settings>>(SETTINGS_PATH);
  return { ...DEFAULT_SETTINGS, ...fileSettings };
}

export async function loadSymbols(): Promise<SymbolEntry[]> {
  const config = await readJson<SymbolsConfig>(SYMBOLS_PATH);
  if (!Array.isArray(config.symbols) || config.symbols.length === 0) {
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
