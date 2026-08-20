import { promises as fs } from "fs";
import path from "path";
import { State } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const STATE_PATH = path.join(DATA_DIR, "state.json");

let mutex: Promise<void> = Promise.resolve();

export function withStateLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = mutex.then(fn, fn);
  mutex = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "ENOENT";
}

export async function loadState(): Promise<State> {
  try {
    const raw = await fs.readFile(STATE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("Invalid state.json: expected an object");
    }
    return parsed as State;
  } catch (error) {
    if (isNotFound(error)) {
      return {};
    }
    throw error;
  }
}

export async function saveState(state: State): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmpPath = `${STATE_PATH}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), "utf-8");
  try {
    await fs.rename(tmpPath, STATE_PATH);
  } catch {
    await fs.copyFile(tmpPath, STATE_PATH);
    await fs.unlink(tmpPath).catch(() => undefined);
  }
}
