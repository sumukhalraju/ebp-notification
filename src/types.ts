export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export type SymbolEntry = {
  symbol: string;
  exchange?: string;
  name?: string;
};

export type Settings = {
  timeframe: string;
  timezone: string;
  cron: string;
  defaultExchange?: string;
  runOnStartup?: boolean;
  h7?: boolean;
};

export type SymbolsConfig = {
  symbols: Array<string | SymbolEntry>;
};

export type StateRecord = {
  lastChecked?: number;
  lastAlert?: number;
};

export type State = Record<string, StateRecord>;
