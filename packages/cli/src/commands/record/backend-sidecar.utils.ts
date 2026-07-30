import { type ChildProcess, spawn } from "child_process";
import * as net from "net";
import * as readline from "readline";
import { initLogger } from "@alwaysmeticulous/common";
import chalk from "chalk";
import { CliUserError } from "../../utils/cli-user-error";

export const DEFAULT_SIDECAR_PORT = 9670;

const HEALTH_POLL_INTERVAL_MS = 250;
const HEALTH_TIMEOUT_MS = 15_000;
const FLUSH_TIMEOUT_MS = 10_000;
const STOP_SIGTERM_TIMEOUT_MS = 5_000;
const STDERR_TAIL_LINES = 20;

export interface SidecarHandle {
  url: string;
  port: number;
  /** Best-effort force-flush of buffered spans (never rejects). */
  flush: () => Promise<void>;
  /** Flushes then terminates the sidecar process. Idempotent. */
  stop: () => Promise<void>;
}

export interface StartSidecarOptions {
  /** Path to the fetched sidecar bundle (node-runnable .cjs). */
  bundlePath: string;
  /** Concrete port — resolve with resolveSidecarPort first. */
  port: number;
  /** Recorder env (METICULOUS_*) merged over the CLI's own process.env. */
  env: Record<string, string>;
  /**
   * Called when the sidecar exits unexpectedly and the single automatic
   * restart has already been used — recording has stopped for good.
   */
  onRecordingStopped?: () => void;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const canBind = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.listen(port, "127.0.0.1", () => {
      probe.close(() => resolve(true));
    });
  });

const findEphemeralPort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (address === null || typeof address !== "object") {
        probe.close(() => reject(new Error("Could not resolve a free port")));
        return;
      }
      const port = address.port;
      probe.close(() => resolve(port));
    });
  });

/**
 * Resolves the port the sidecar will listen on. `requested === 0` always
 * picks an ephemeral port. A busy requested port falls back to an ephemeral
 * one in wrapped mode (the CLI controls the URL injected into the worker) but
 * is a hard error in sidecar-only mode, where the user is about to configure
 * the printed URL by hand and needs it predictable.
 */
export const resolveSidecarPort = async (
  requested: number,
  mode: "wrapped" | "sidecar-only",
): Promise<number> => {
  if (requested === 0) {
    return findEphemeralPort();
  }
  if (await canBind(requested)) {
    return requested;
  }
  if (mode === "wrapped") {
    const fallback = await findEphemeralPort();
    initLogger().warn(
      `Port ${requested} is in use — using port ${fallback} for the Meticulous sidecar instead.`,
    );
    return fallback;
  }
  throw new CliUserError(
    `Port ${requested} is already in use. Pass --port to choose a different sidecar port.`,
  );
};

const prefixPipe = (
  stream: NodeJS.ReadableStream,
  onLine: (line: string) => void,
): void => {
  readline.createInterface({ input: stream }).on("line", onLine);
};

const fetchWithTimeout = async (
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

interface SpawnedSidecar {
  child: ChildProcess;
  stderrTail: string[];
}

const spawnSidecarProcess = (options: StartSidecarOptions): SpawnedSidecar => {
  const logger = initLogger();
  const child = spawn(process.execPath, [options.bundlePath], {
    env: {
      ...process.env,
      ...options.env,
      METICULOUS_SIDECAR_PORT: String(options.port),
    },
    stdio: ["ignore", "pipe", "pipe"],
    // Own process group (POSIX) so terminal Ctrl-C reaches the CLI and the
    // wrapped dev command but NOT the sidecar — the CLI drains the dev
    // command first, flushes, and only then stops the sidecar, so capture
    // events emitted during the dev server's teardown are not lost.
    detached: process.platform !== "win32",
  });

  const stderrTail: string[] = [];
  const prefix = chalk.dim("[meticulous sidecar]");
  if (child.stdout) {
    prefixPipe(child.stdout, (line) => logger.info(`${prefix} ${line}`));
  }
  if (child.stderr) {
    prefixPipe(child.stderr, (line) => {
      stderrTail.push(line);
      if (stderrTail.length > STDERR_TAIL_LINES) {
        stderrTail.shift();
      }
      logger.warn(`${prefix} ${line}`);
    });
  }
  return { child, stderrTail };
};

const awaitHealthy = async (
  spawned: SpawnedSidecar,
  url: string,
): Promise<void> => {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  let exited = false;
  let exitCode: number | null = null;
  spawned.child.once("exit", (code) => {
    exited = true;
    exitCode = code;
  });

  while (Date.now() < deadline) {
    if (exited) {
      throw new CliUserError(
        `The Meticulous sidecar exited during startup (exit code ${String(
          exitCode,
        )}).${
          spawned.stderrTail.length > 0
            ? `\n${spawned.stderrTail.join("\n")}`
            : ""
        }`,
      );
    }
    try {
      const response = await fetchWithTimeout(
        `${url}/v1/health`,
        { method: "GET" },
        1_000,
      );
      if (response.ok) {
        return;
      }
    } catch {
      // Not up yet — keep polling.
    }
    await sleep(HEALTH_POLL_INTERVAL_MS);
  }
  throw new CliUserError(
    `The Meticulous sidecar did not become healthy within ${
      HEALTH_TIMEOUT_MS / 1000
    }s.${
      spawned.stderrTail.length > 0 ? `\n${spawned.stderrTail.join("\n")}` : ""
    }`,
  );
};

const terminateChild = async (child: ChildProcess): Promise<void> => {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  const exited = new Promise<void>((resolve) =>
    child.once("exit", () => resolve()),
  );
  child.kill("SIGTERM");
  const timedOut = await Promise.race([
    exited.then(() => false),
    sleep(STOP_SIGTERM_TIMEOUT_MS).then(() => true),
  ]);
  if (timedOut) {
    child.kill("SIGKILL");
    await Promise.race([exited, sleep(2_000)]);
  }
};

/**
 * Spawns the sidecar bundle as a detached child process, waits for it to
 * become healthy, and supervises it: one automatic restart on the same port
 * if it dies unexpectedly (the worker holds the old URL, so the port must be
 * reused), after which recording is declared stopped without affecting the
 * wrapped dev command.
 */
export const startSidecar = async (
  options: StartSidecarOptions,
): Promise<SidecarHandle> => {
  const logger = initLogger();
  const url = `http://127.0.0.1:${options.port}`;

  let current = spawnSidecarProcess(options);
  let restarted = false;
  let stopping = false;

  const watchExit = (spawned: SpawnedSidecar): void => {
    spawned.child.once("exit", (code) => {
      if (stopping) {
        return;
      }
      if (!restarted) {
        restarted = true;
        logger.warn(
          `The Meticulous sidecar exited unexpectedly (exit code ${String(
            code,
          )}) — restarting it once...`,
        );
        void (async () => {
          try {
            current = spawnSidecarProcess(options);
            await awaitHealthy(current, url);
            // Only supervise the restarted process once it is healthy — an
            // exit during its startup is handled by awaitHealthy rejecting.
            watchExit(current);
            logger.warn("Meticulous sidecar restarted.");
          } catch (error) {
            current.child.kill("SIGKILL");
            logger.error(
              `Could not restart the Meticulous sidecar — backend recording has stopped. Your dev server is unaffected. ${String(
                error,
              )}`,
            );
            options.onRecordingStopped?.();
          }
        })();
      } else {
        logger.error(
          "The Meticulous sidecar exited again — backend recording has stopped. Your dev server is unaffected.",
        );
        options.onRecordingStopped?.();
      }
    });
  };

  try {
    await awaitHealthy(current, url);
  } catch (error) {
    // Never leave a half-started detached sidecar behind — it would outlive
    // the failed CLI run and hold the port. (No-op if it already exited.)
    current.child.kill("SIGKILL");
    throw error;
  }
  // Supervision starts only once the sidecar is healthy: an exit during
  // startup is a startup failure (reported above), not a crash to restart.
  watchExit(current);

  // Don't let a crashed CLI orphan the detached sidecar.
  process.once("exit", () => {
    try {
      current.child.kill("SIGTERM");
    } catch {
      // Already gone.
    }
  });

  const flush = async (): Promise<void> => {
    try {
      await fetchWithTimeout(
        `${url}/v1/flush`,
        { method: "POST" },
        FLUSH_TIMEOUT_MS,
      );
    } catch (error) {
      logger.warn(
        `Could not flush the Meticulous sidecar — some captured requests may not have been uploaded. ${String(
          error,
        )}`,
      );
    }
  };

  return {
    url,
    port: options.port,
    flush,
    stop: async () => {
      if (stopping) {
        return;
      }
      stopping = true;
      await flush();
      // The sidecar's own SIGTERM handler also flushes before exiting, so
      // this is belt-and-braces.
      await terminateChild(current.child);
    },
  };
};
