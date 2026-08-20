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

export type HourPair = [number, number];

export type Settings = {
  timeframe: string;
  timezone: string;
  cron: string;
  defaultExchange?: string;
  runOnStartup?: boolean;
  h7?: boolean;
  h7Cron?: string;
  h7AnchorHours?: number[];
  h7Transitions?: HourPair[];
  lookbackDays?: number;
  fetchConcurrency?: number;
  failureAlertThreshold?: number;
  heartbeatCron?: string;
};

export type SymbolsConfig = {
  symbols: Array<string | SymbolEntry>;
};

export type StateRecord = {
  lastChecked?: number;
  lastAlert?: number;
};

export type State = Record<string, StateRecord>;

export type RunResult = {
  symbol: string;
  patterns: number;
  error?: string;
};

export type SymbolResult = {
  patterns: number;
  messages: string[];
};

export type CandleProvider = {
  fetchCandles(tvSymbol: string, timeframe: string, count: number): Promise<Candle[]>;
  fetchCandlesH7(
    tvSymbol: string,
    timezone: string,
    count: number,
    anchorHours?: number[]
  ): Promise<Candle[]>;
};
