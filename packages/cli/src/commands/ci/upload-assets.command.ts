import { initLogger } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { OPTIONS } from "../../command-utils/common-options";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { triggerTestRun } from "./trigger-test-run.core";
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
  appDirectory?: string | undefined;
  appZip?: string | undefined;
  rewrites?: string;
  waitForBase: boolean;
  waitForTestRunToComplete: boolean;
}

const handler = async (options: Options): Promise<void> => {
  initLogger();
  warnIfDeprecatedTriggerOptionsUsed(options);
  await triggerTestRun(options);
};

export const ciUploadAssetsCommand: CommandModule<unknown, Options> = {
  command: "upload-assets",
  describe:
    "Upload build artifacts to Meticulous, potentially triggering a test run",
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
    appDirectory: {
      string: true,
      description:
        "The directory containing the application's static assets. Either this or --appZip must be provided.",
    },
    appZip: {
      string: true,
      description:
        "The zip file containing the application's static assets. Either this or --appDirectory must be provided.",
    },
    rewrites: {
      string: true,
      default: "[]",
      description:
        "URL rewrite rules. This string should be a valid JSON array in the format described at https://github.com/vercel/serve-handler?tab=readme-ov-file#rewrites-array." +
        ' Note: if no rules are passed, or an empty list is passed, we default to the rewrite rule \'{ source: "**", destination: "/index.html" }\'.',
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
  },
  handler: wrapHandler(handler),
};
