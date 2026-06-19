import { ContainerEnvVariable } from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import { CommandModule } from "yargs";
import { OPTIONS } from "../../command-utils/common-options";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { triggerTestRun } from "../agent/trigger-test-run/trigger-test-run.core";
import {
  DEPRECATED_TRIGGER_OPTION_DESCRIPTION,
  warnIfDeprecatedTriggerOptionsUsed,
} from "./deprecated-trigger-options";

interface Options {
  apiToken?: string | undefined;
  commitSha?: string | undefined;
  baseSha?: string | undefined;
  gitDiffOutput?: string | undefined;
  repoDirectory?: string | undefined;
  localImageTag: string;
  waitForBase: boolean;
  waitForTestRunToComplete: boolean;
  containerPort?: number | undefined;
  containerEnv?: ContainerEnvVariable[] | undefined;
  containerHealthCheckEndpoint?: string | undefined;
}

const handler = async (options: Options): Promise<void> => {
  initLogger();
  warnIfDeprecatedTriggerOptionsUsed(options);
  await triggerTestRun(options);
};

export const ciUploadContainerCommand: CommandModule<unknown, Options> = {
  command: "upload-container",
  describe:
    "Upload a Docker container to Meticulous and trigger a test run against it",
  builder: {
    apiToken: OPTIONS.apiToken,
    commitSha: OPTIONS.commitSha,
    baseSha: {
      string: true,
      deprecated: true,
      description: `The base commit SHA to compare against. ${DEPRECATED_TRIGGER_OPTION_DESCRIPTION}`,
    },
    gitDiffOutput: {
      string: true,
      deprecated: true,
      description: `Raw git diff output between the base and head commits. Requires --baseSha. ${DEPRECATED_TRIGGER_OPTION_DESCRIPTION}`,
    },
    repoDirectory: {
      string: true,
      deprecated: true,
      description: `The path to a git repository, used to infer --commitSha, --baseSha, and --gitDiffOutput. ${DEPRECATED_TRIGGER_OPTION_DESCRIPTION}`,
    },
    localImageTag: {
      demandOption: true,
      string: true,
      description:
        "The local Docker image tag to upload (e.g., 'myapp:latest' or image SHA)",
    },
    waitForBase: {
      boolean: true,
      default: true,
      description:
        "If true, the launcher will try to wait for a base test run to be created before triggering a test run.",
    },
    waitForTestRunToComplete: {
      boolean: true,
      default: false,
      deprecated: true,
      description: `If true, block until the triggered test run finishes. ${DEPRECATED_TRIGGER_OPTION_DESCRIPTION}`,
    },
    containerPort: {
      number: true,
      description: "The port to expose the container on.",
    },
    containerEnv: {
      array: true,
      coerce: (value: string[]) =>
        value.map((v) => {
          const [name, ...rest] = v.split("=");
          const envValue = rest.join("=");
          if (!name || !envValue) {
            throw new Error(`Invalid environment variable: ${v}`);
          }
          return { name, value: envValue };
        }),
      description: "The environment variables to set in the container.",
    },
    containerHealthCheckEndpoint: {
      string: true,
      description:
        "The endpoint path to use for health checks on the container (e.g., '/health').",
    },
  },
  handler: wrapHandler(handler),
};
