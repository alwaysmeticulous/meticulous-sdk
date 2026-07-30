import { spawn } from "child_process";
import {
  createClientWithOAuth,
  getProject,
  resolveApiTokenWithOAuth,
} from "@alwaysmeticulous/client";
import { defer, initLogger } from "@alwaysmeticulous/common";
import { fetchAsset } from "@alwaysmeticulous/downloading-helpers";
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
import {
  DEFAULT_SIDECAR_PORT,
  resolveSidecarPort,
  startSidecar,
} from "./backend-sidecar.utils";

const DEV_COMMAND_SIGTERM_TIMEOUT_MS = 10_000;

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

const handler = async (options: Options): Promise<void> => {
  const logger = initLogger();

  const devCommand = extractPassthroughCommand(process.argv);
  if (!devCommand && (options.devCommand?.length ?? 0) > 0) {
    // Without the separator, yargs would swallow the dev command's own flags
    // (e.g. its --port) as our options — refuse rather than silently starting
    // in sidecar-only mode.
    throw new CliUserError(
      "Pass the dev command after a -- separator, e.g.: meticulous record backend -- npx wrangler dev",
    );
  }
  const mode = devCommand ? "wrapped" : "sidecar-only";

  // Fail fast on auth before spawning anything.
  const { recordingToken, projectName } = await resolveRecordingTarget(options);

  logger.info("Fetching the Meticulous backend recorder sidecar...");
  const bundlePath = await fetchAsset(BACKEND_SIDECAR_BUNDLE_PATH);
  const port = await resolveSidecarPort(options.port, mode);

  const done = defer<number>();

  const sidecar = await startSidecar({
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

  let shuttingDown = false;
  const shutdown = async (exitCode: number): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    await sidecar.stop();
    done.resolve(exitCode);
  };

  if (devCommand) {
    const kind = classifyDevCommand(devCommand);
    const argv =
      options.injectSidecarVar && kind !== "unknown"
        ? injectSidecarVar(devCommand, kind, sidecar.url)
        : devCommand;
    if (options.injectSidecarVar && kind !== "unknown") {
      logger.info(
        `Passing ${SIDECAR_URL_VAR_NAME}=${sidecar.url} to ${
          kind === "wrangler-dev" ? "wrangler dev" : "wrangler pages dev"
        }`,
      );
    } else {
      printWorkerInstructions(sidecar.url);
    }

    const child = spawn(argv[0], argv.slice(1), {
      stdio: "inherit",
      env: {
        ...process.env,
        // Harmless for workerd (host env is invisible inside the isolate) but
        // lets non-workerd tooling in the dev command see the URL.
        [SIDECAR_URL_VAR_NAME]: sidecar.url,
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
  } else {
    printWorkerInstructions(sidecar.url);
    logger.info("Press Ctrl-C to stop recording.");
    process.on("SIGINT", () => void shutdown(0));
    process.on("SIGTERM", () => void shutdown(0));
  }

  const exitCode = await done.promise;
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
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
