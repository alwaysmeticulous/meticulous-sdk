import { createClientWithOAuth, ignoreCheck } from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { requireArgument } from "./argument-validation.utils";
import {
  CHECK_REVIEW_REASON_NOTE,
  type CheckTargetOptions,
  checkTargetOptions,
  outputCheckReview,
  requireCheckTarget,
  resolveCheckTarget,
} from "./check-review-write.utils";

interface Options extends CheckTargetOptions {
  apiToken?: string | null | undefined;
  reason: string;
  json: boolean;
}

const handler = async ({
  apiToken,
  reason,
  json,
  ...targetOptions
}: Options): Promise<void> => {
  initLogger();
  requireCheckTarget(targetOptions);
  requireArgument("reason", reason);
  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });
  const target = await resolveCheckTarget(client, targetOptions);
  const response = await ignoreCheck({ client, ...target, reason });
  outputCheckReview(response, { json, verdict: "ignored" });
};

export const ignoreCheckCommand: CommandModule<unknown, Options> = {
  command: "ignore-check",
  describe: `Record an agent decision ignoring a failing non-visual check as unrelated to the change under review — typically a flake — with a reason justifying it. Refused on a check a person rejected. ${CHECK_REVIEW_REASON_NOTE} Outputs nothing, or an empty object with --json.`,
  builder: {
    apiToken: { string: true, description: "Meticulous API token." },
    ...checkTargetOptions,
    reason: {
      string: true,
      description:
        "A succinct 1-3 sentence justification of why the check's finding is unrelated to the change under review.",
      demandOption: true,
    },
  },
  handler: wrapHandler(handler),
};
