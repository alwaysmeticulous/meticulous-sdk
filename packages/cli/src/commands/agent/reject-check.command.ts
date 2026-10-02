import { createClientWithOAuth, rejectCheck } from "@alwaysmeticulous/client";
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
  const response = await rejectCheck({ client, ...target, reason });
  outputCheckReview(response, { json, verdict: "rejected" });
};

export const rejectCheckCommand: CommandModule<unknown, Options> = {
  command: "reject-check",
  describe: `Record an agent decision rejecting a failing non-visual check, with a reason justifying it. ${CHECK_REVIEW_REASON_NOTE} Outputs nothing, or an empty object with --json.`,
  builder: {
    apiToken: { string: true, description: "Meticulous API token." },
    ...checkTargetOptions,
    reason: {
      string: true,
      description:
        "A succinct 1-3 sentence justification of why the check's finding is a regression.",
      demandOption: true,
    },
  },
  handler: wrapHandler(handler),
};
