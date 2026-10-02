import { approveCheck, createClientWithOAuth } from "@alwaysmeticulous/client";
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
  reason?: string | undefined;
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
  if (reason != null) {
    requireArgument("reason", reason);
  }
  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });
  const target = await resolveCheckTarget(client, targetOptions);
  const response = await approveCheck({ client, ...target, reason });
  outputCheckReview(response, { json, verdict: "approved" });
};

export const approveCheckCommand: CommandModule<unknown, Options> = {
  command: "approve-check",
  describe: `Record an agent decision approving a failing non-visual check, optionally with a reason justifying it. Only available on projects with the "Enable approve/ignore check actions" setting, and refused on a check a person rejected. ${CHECK_REVIEW_REASON_NOTE} Outputs nothing, or an empty object with --json.`,
  builder: {
    apiToken: { string: true, description: "Meticulous API token." },
    ...checkTargetOptions,
    reason: {
      string: true,
      description:
        "An optional succinct 1-3 sentence justification of why the check's finding is an intended result of the change under review.",
    },
  },
  handler: wrapHandler(handler),
};
