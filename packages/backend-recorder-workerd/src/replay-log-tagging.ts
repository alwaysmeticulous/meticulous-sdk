import { requestCaptureContext } from "./context";

type ConsoleLogMethod = (...args: unknown[]) => void;

const CONSOLE_METHODS = [
  "debug",
  "error",
  "info",
  "log",
  "trace",
  "warn",
] as const;

type ConsoleMethodName = (typeof CONSOLE_METHODS)[number];

const CONSOLE_TAGGING_INSTALLED = Symbol.for(
  "meticulous.workerd.consoleReplayTaggingInstalled",
);

// This literal is part of the persisted log wire format. Keep it pinned here
// rather than deriving it from the HTTP header, whose name can change
// independently of logs that have already been written to S3.
const REPLAY_ID_LOG_TAG_NAME = "meticulous-replay-id";

const formatReplayIdLogTag = (replayId: string): string =>
  `[${REPLAY_ID_LOG_TAG_NAME}:${replayId}] `;

const tagContinuationLines = (value: string, prefix: string): string =>
  value.replace(/\n(?=.)/g, `\n${prefix}`);

const prepareConsoleArgument = (value: unknown, prefix: string): unknown => {
  if (typeof value === "string") {
    return tagContinuationLines(value, prefix);
  }
  if (value instanceof Error) {
    return tagContinuationLines(value.stack ?? value.message, prefix);
  }
  return value;
};

/**
 * Adds the active request's replay marker. Keeping a string first argument in
 * place preserves formatting such as `console.log("user=%s", id)`. Embedded
 * newlines in strings and Error stacks are tagged too, since container runtimes
 * may emit their continuation lines as separate log records.
 */
export const createReplayTaggedConsoleMethod =
  (original: ConsoleLogMethod): ConsoleLogMethod =>
  (...args: unknown[]): void => {
    let outputArgs = args;
    try {
      const ctx = requestCaptureContext.getStore();
      if (ctx?.mode === "replay") {
        const prefix = formatReplayIdLogTag(ctx.replayId);
        const preparedArgs = args.map((arg) =>
          prepareConsoleArgument(arg, prefix),
        );
        outputArgs =
          typeof preparedArgs[0] === "string"
            ? [prefix + preparedArgs[0], ...preparedArgs.slice(1)]
            : [prefix, ...preparedArgs];
      }
    } catch {
      // Log tagging must never interfere with the customer's logger. The
      // original call below still receives its untouched arguments.
    }
    original(...outputArgs);
  };

/**
 * Patches Workerd's output-producing console methods once. Outside a replayed
 * request the wrappers are transparent; inside one they resolve the replay id
 * from Workerd's request-scoped AsyncLocalStorage, so concurrent replays cannot
 * label each other's output.
 */
export const installReplayLogTagging = (
  methods = console as unknown as Record<ConsoleMethodName, ConsoleLogMethod>,
  holder = globalThis as typeof globalThis & {
    [CONSOLE_TAGGING_INSTALLED]?: boolean;
  },
): void => {
  if (holder[CONSOLE_TAGGING_INSTALLED]) {
    return;
  }
  holder[CONSOLE_TAGGING_INSTALLED] = true;

  for (const method of CONSOLE_METHODS) {
    try {
      methods[method] = createReplayTaggedConsoleMethod(
        methods[method].bind(methods),
      );
    } catch {
      // A runtime may expose a non-writable console method. Keep the remaining
      // methods useful rather than making replay initialization fail.
    }
  }
};
