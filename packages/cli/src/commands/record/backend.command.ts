import { spawn } from "child_process";
import {
  createClientWithOAuth,
  getProject,
  resolveApiTokenWithOAuth,
} from "@alwaysmeticulous/client";
import type { Deferred } from "@alwaysmeticulous/common";
import { defer, initLogger } from "@alwaysmeticulous/common";
import { fetchAsset } from "@alwaysmeticulous/downloading-helpers";
import * as Sentry from "@sentry/node";
import type { CommandModule } from "yargs";
import { OPTIONS } from "../../command-utils/common-options";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { CliUserError } from "../../utils/cli-user-error";
import { BACKEND_SIDECAR_BUNDLE_PATH } from "../../utils/constants";
import { resolveProjectIdentifier } from "../../utils/resolve-project-identifier";
import {
  classifyDevCommand,
  extractPassthroughCommand,
  injectSidecarVar,
  SIDECAR_URL_VAR_NAME,
} from "./backend-dev-command.utils";
import type { SidecarHandle } from "./backend-sidecar.utils";
import {
  DEFAULT_SIDECAR_PORT,
  resolveSidecarPort,
  startSidecar,
} from "./backend-sidecar.utils";

const DEV_COMMAND_SIGTERM_TIMEOUT_MS = 10_000;

type Mode = "wrapped" | "sidecar-only";

interface Options {
  apiToken: string | null | undefined;
  recordingToken: string | null | undefined;
  port: number;
  exportMode: string;
  localOutputDir: string | null | undefined;
  injectSidecarVar: boolean;
  /** Positional tokens yargs collected — only valid when passed after `--`. */
  devCommand: (string | number)[] | undefined;
}

const handler = async (options: Options): Promise<void> => {
  const devCommand = extractPassthroughCommand(process.argv);
  if (!devCommand && (options.devCommand?.length ?? 0) > 0) {
    // Without the separator, yargs would swallow the dev command's own flags
    // (e.g. its --port) as our options — refuse rather than silently starting
    // in sidecar-only mode.
    throw new CliUserError(
      "Pass the dev command after a -- separator, e.g.: meticulous record backend -- npx wrangler dev",
    );
  }

  if (devCommand) {
    return runWrappedDevCommand(options, devCommand);
  }
  return runSidecarOnly(options);
};

/**
 * Runs the user's dev command with recording alongside it.
 *
 * A recorder that cannot start is never a reason to stop the dev server, so
 * every failure up to and including the sidecar's own startup degrades to
 * running the dev command unrecorded.
 */
const runWrappedDevCommand = async (
  options: Options,
  devCommand: string[],
): Promise<void> => {
  const logger = initLogger();
  const sidecar = await startRecorderOrContinueWithout(options);

  const done = defer<number>();
  const shutdown = createShutdown(sidecar, done);

  const argv = sidecar
    ? wireSidecarIntoDevCommand(devCommand, options, sidecar.url)
    : devCommand;

  const child = spawn(argv[0], argv.slice(1), {
    stdio: "inherit",
    env: {
      ...process.env,
      // Harmless for workerd (host env is invisible inside the isolate) but
      // lets non-workerd tooling in the dev command see the URL. Left
      // untouched when there is no sidecar, so the dev command sees exactly
      // the environment it would have seen without Meticulous in front of it.
      ...(sidecar ? { [SIDECAR_URL_VAR_NAME]: sidecar.url } : {}),
    },
    // npx/pnpm/yarn shims on Windows are .cmd files, which require a shell.
    shell: process.platform === "win32",
  });

  child.on("error", (error) => {
    logger.error(`Could not start dev command: ${String(error)}`);
    void shutdown(1);
  });
  child.on("exit", (code, signal) => {
    // Wrangler teardown may still emit late waitUntil capture events; the
    // sidecar is flushed and stopped only now, after the dev command exited.
    void shutdown(code ?? (signal ? 1 : 0));
  });

  const forwardSignal = (signal: NodeJS.Signals): void => {
    // On terminal Ctrl-C the child receives SIGINT alongside us (same
    // process group); forwarding covers direct kills of the CLI process.
    // The dev command's own exit then drives the shutdown path above.
    if (child.exitCode === null && child.signalCode === null) {
      child.kill(signal);
      setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
        }
      }, DEV_COMMAND_SIGTERM_TIMEOUT_MS).unref();
    }
  };
  process.on("SIGINT", () => forwardSignal("SIGINT"));
  process.on("SIGTERM", () => forwardSignal("SIGTERM"));

  const exitCode = await done.promise;
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
};

/**
 * Runs the sidecar on its own, for a dev command the user starts themselves.
 * There is no dev command to protect here, so a recorder that cannot start is
 * fatal — the alternative is a process that sits there recording nothing.
 */
const runSidecarOnly = async (options: Options): Promise<void> => {
  const logger = initLogger();
  const sidecar = await startRecorder(options, "sidecar-only");

  const done = defer<number>();
  const shutdown = createShutdown(sidecar, done);

  printWorkerInstructions(sidecar.url);
  logger.info("Press Ctrl-C to stop recording.");
  process.on("SIGINT", () => void shutdown(0));
  process.on("SIGTERM", () => void shutdown(0));

  await done.promise;
};

/** Flushes and stops the sidecar (if any), then settles the run. Idempotent. */
const createShutdown = (
  sidecar: SidecarHandle | null,
  done: Deferred<number>,
): ((exitCode: number) => Promise<void>) => {
  let shuttingDown = false;
  return async (exitCode: number) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    await sidecar?.stop();
    done.resolve(exitCode);
  };
};

/** {@link startRecorder}, reporting a failure instead of propagating it. */
const startRecorderOrContinueWithout = async (
  options: Options,
): Promise<SidecarHandle | null> => {
  const logger = initLogger();
  try {
    return await startRecorder(options, "wrapped");
  } catch (error) {
    // Mirrors reportHandlerError in sentry.utils.ts: a CliUserError already
    // explains itself and is the user's to fix, anything else is a bug worth
    // knowing about even though it did not stop the command.
    if (error instanceof CliUserError) {
      logger[error.severity](error.message);
    } else {
      logger.error(error instanceof Error ? error.message : String(error));
      logger.debug(error);
      Sentry.captureException(error);
    }
    logger.warn(
      "Could not start backend recording — running your dev command without it. Nothing was recorded; re-run the command to try again.",
    );
    return null;
  }
};

/**
 * Resolves the recording token, fetches the sidecar bundle and brings the
 * sidecar up healthy. Rejects if any of that fails; nothing is left running.
 */
const startRecorder = async (
  options: Options,
  mode: Mode,
): Promise<SidecarHandle> => {
  const logger = initLogger();
  const { recordingToken, projectName } = await resolveRecordingTarget(options);

  logger.info("Fetching the Meticulous backend recorder sidecar...");
  const bundlePath = await fetchAsset(BACKEND_SIDECAR_BUNDLE_PATH);
  const port = await resolveSidecarPort(options.port, mode);

  return startSidecar({
    bundlePath,
    port,
    env: {
      METICULOUS_RECORDING_TOKEN: recordingToken,
      METICULOUS_EXPORT_MODE: options.exportMode,
      ...(options.localOutputDir
        ? { METICULOUS_LOCAL_OUTPUT_DIR: options.localOutputDir }
        : {}),
      ...(projectName ? { METICULOUS_PROJECT_NAME: projectName } : {}),
    },
    // Recording stopping is not fatal to the user's dev loop — keep the dev
    // command (or the wait in sidecar-only mode) running.
    onRecordingStopped: () => {},
  });
};

interface ResolvedRecordingTarget {
  recordingToken: string;
  projectName: string | undefined;
}

const resolveRecordingTarget = async (
  options: Pick<Options, "apiToken" | "recordingToken">,
): Promise<ResolvedRecordingTarget> => {
  const logger = initLogger();
  if (options.recordingToken) {
    return { recordingToken: options.recordingToken, projectName: undefined };
  }

  const apiToken = await resolveApiTokenWithOAuth({
    apiToken: options.apiToken,
    enableOAuthLogin: true,
  });
  const { projectId } = await resolveProjectIdentifier(apiToken);
  const client = await createClientWithOAuth({
    apiToken: options.apiToken,
    enableOAuthLogin: true,
  });
  const project = await getProject(client, projectId);
  if (!project) {
    throw new CliUserError(
      "Could not retrieve project data. Is the API token correct?",
    );
  }
  if (!project.recordingToken) {
    throw new CliUserError("Could not retrieve recording token.");
  }
  logger.info(
    `Recording backend sessions for ${project.organization.name}/${project.name}`,
  );
  return {
    recordingToken: project.recordingToken,
    projectName: project.name,
  };
};

/**
 * Returns the argv to spawn, with the sidecar URL injected when the dev command
 * is a recognized wrangler invocation, and tells the user which happened.
 */
const wireSidecarIntoDevCommand = (
  devCommand: string[],
  options: Pick<Options, "injectSidecarVar">,
  sidecarUrl: string,
): string[] => {
  const logger = initLogger();
  const kind = classifyDevCommand(devCommand);
  if (!options.injectSidecarVar || kind === "unknown") {
    printWorkerInstructions(sidecarUrl);
    return devCommand;
  }
  logger.info(
    `Passing ${SIDECAR_URL_VAR_NAME}=${sidecarUrl} to ${
      kind === "wrangler-dev" ? "wrangler dev" : "wrangler pages dev"
    }`,
  );
  return injectSidecarVar(devCommand, kind, sidecarUrl);
};

const printWorkerInstructions = (sidecarUrl: string): void => {
  const logger = initLogger();
  logger.info("");
  logger.info(
    `Meticulous sidecar running at ${sidecarUrl}. To record your worker:`,
  );
  logger.info(
    "  1. Wrap your handler with withMeticulous from @alwaysmeticulous/backend-recorder-workerd",
  );
  logger.info(
    '  2. Enable the "nodejs_als" (or "nodejs_compat") compatibility flag',
  );
  logger.info(
    "  3. Expose the sidecar URL to the worker (workerd cannot see host environment variables):",
  );
  logger.info(
    `       npx wrangler dev --var ${SIDECAR_URL_VAR_NAME}:${sidecarUrl}`,
  );
  logger.info(
    `     or add to .dev.vars: ${SIDECAR_URL_VAR_NAME}=${sidecarUrl}`,
  );
  logger.info("");
};

export const recordBackendCommand: CommandModule<unknown, Options> = {
  command: "backend [devCommand...]",
  describe:
    "Record backend sessions from a Cloudflare Workers (workerd) app during local development. " +
    "Starts the Meticulous recorder sidecar and optionally wraps your dev command: " +
    "meticulous record backend -- npx wrangler dev",
  builder: {
    apiToken: OPTIONS.apiToken,
    recordingToken: {
      string: true,
      description:
        "Recording token to upload with (skips API authentication). Defaults to the project's recording token resolved via the API token.",
    },
    port: {
      number: true,
      default: DEFAULT_SIDECAR_PORT,
      description: `Port for the sidecar to listen on (0 picks a free port; default ${DEFAULT_SIDECAR_PORT})`,
    },
    exportMode: {
      string: true,
      choices: ["s3", "local"],
      default: "s3",
      description:
        'Where the sidecar exports recorded sessions: "s3" uploads to Meticulous, "local" writes to disk for debugging',
    },
    localOutputDir: {
      string: true,
      description: "Directory for exported sessions when --exportMode is local",
    },
    injectSidecarVar: {
      boolean: true,
      default: true,
      description:
        "Automatically pass the sidecar URL to a recognized wrangler dev command via --var/--binding",
    },
  },
  handler: wrapHandler(handler),
};
