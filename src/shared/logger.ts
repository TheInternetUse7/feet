import fs from "node:fs";
import path from "node:path";

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const LEVEL_LABEL: Record<Level, string> = { debug: "DBG", info: "INF", warn: "WRN", error: "ERR" };
const LEVEL_COLOR: Record<Level, string> = {
  debug: "\x1b[2m",
  info: "\x1b[36m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
};

function parseLevel(value: string | undefined): Level {
  switch (value?.toLowerCase()) {
    case "debug":
    case "info":
    case "warn":
    case "error":
      return value.toLowerCase() as Level;
    default:
      return "info";
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function plain(args: unknown[]): string {
  return args
    .map((arg) => {
      if (arg instanceof Error) return arg.stack ?? `${arg.name}: ${arg.message}`;
      if (typeof arg === "string") return arg;
      if (isObject(arg)) {
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    })
    .join(" ");
}

const minLevel = parseLevel(process.env.LOG_LEVEL);
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;

let fileStream: fs.WriteStream | null = null;
if (process.env.LOG_FILE) {
  const logFilePath = path.resolve(process.env.LOG_FILE);
  try {
    fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
    fileStream = fs.createWriteStream(logFilePath, { flags: "a" });
    fileStream.on("error", () => {
      fileStream = null;
    });
  } catch {
    fileStream = null;
  }
}

export interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  child: (namespace: string) => Logger;
}

export function log(namespace: string): Logger {
  function emit(level: Level, ...args: unknown[]): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;

    const ts = new Date().toISOString();
    const line = `${ts} ${LEVEL_LABEL[level]} [${namespace}]`;

    if (level === "error") console.error(colorize(level, line), ...args);
    else if (level === "warn") console.warn(colorize(level, line), ...args);
    else console.log(colorize(level, line), ...args);

    fileStream?.write(`${line} ${plain(args)}\n`);
  }

  function colorize(level: Level, line: string): string {
    if (!useColor) return line;
    return `${LEVEL_COLOR[level]}${line}\x1b[0m`;
  }

  return {
    debug: (...args) => emit("debug", ...args),
    info: (...args) => emit("info", ...args),
    warn: (...args) => emit("warn", ...args),
    error: (...args) => emit("error", ...args),
    child: (ns) => log(`${namespace}:${ns}`),
  };
}
