type Level = "debug" | "info" | "warn" | "error";

const order: Record<Level, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

function currentLevel(): Level {
  const raw = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  return "info";
}

function emit(level: Level, message: string, args: unknown[]): void {
  if (order[level] < order[currentLevel()]) {
    return;
  }
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}`;
  if (level === "error") {
    console.error(line, ...args);
  } else if (level === "warn") {
    console.warn(line, ...args);
  } else {
    console.log(line, ...args);
  }
}

export const log = {
  debug: (message: string, ...args: unknown[]) => emit("debug", message, args),
  info: (message: string, ...args: unknown[]) => emit("info", message, args),
  warn: (message: string, ...args: unknown[]) => emit("warn", message, args),
  error: (message: string, ...args: unknown[]) => emit("error", message, args)
};
