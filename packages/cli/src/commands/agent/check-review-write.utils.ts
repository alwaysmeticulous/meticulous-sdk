import type {
  AgentCheckReviewResponse,
  MeticulousClient,
  TestRunCheckType,
} from "@alwaysmeticulous/client";
import { logNotice } from "@alwaysmeticulous/common";
import { printJson } from "../../command-utils/print-json";
import { CliUserError } from "../../utils/cli-user-error";
import { resolveTestRunForPullRequestOrThrow } from "../../utils/resolve-test-run-from-commit";
import { requireIdArgument } from "./argument-validation.utils";
import { prNumberOption } from "./pr-number-option";

/** The options identifying the check a check-review command is about. */
export interface CheckTargetOptions {
  testRunId: string | undefined;
  prNumber: number | undefined;
  project: string | undefined;
  checkId: string;
  checkType: TestRunCheckType | undefined;
}

/** The check a check-review command is about, with its test run resolved. */
export interface CheckTarget {
  testRunId: string;
  checkId: string;
  checkType: TestRunCheckType | undefined;
}

export const checkTargetOptions = {
  testRunId: {
    string: true,
    description: "The test run ID. Pass either this or --prNumber.",
  },
  prNumber: prNumberOption(),
  project: {
    string: true,
    description:
      "The project to look up the pull request in (id, 'org/proj', or simply 'proj'), with --prNumber only. One-off override; when omitted, uses the OAuth user's configured default project or the API token's own project(s).",
    conflicts: "testRunId",
  },
  checkId: {
    string: true,
    description:
      "The check ID, as listed by `agent test-run-check --availableIds`.",
    demandOption: true,
  },
  checkType: {
    choices: ["builtin", "custom"] as const,
    description:
      "Who computed the check: builtin for a Meticulous-provided check, or custom for a customer-reported check. Defaults to builtin.",
  },
} as const;

export const CHECK_REVIEW_REASON_NOTE =
  "The reason is stored with the decision as its justification and can be read back with `agent check-comments`; it isn't shown in the Meticulous app.";

/**
 * The response carries nothing, so human mode only confirms the decision on
 * stderr and leaves stdout empty.
 */
export const outputCheckReview = (
  response: AgentCheckReviewResponse,
  { json, verdict }: { json: boolean; verdict: string },
): void => {
  if (json) {
    printJson(response);
  } else {
    logNotice(`Check ${verdict}.`);
  }
};

/** Validates the target before logging in, so a bad call fails without a prompt. */
export const requireCheckTarget = ({
  testRunId,
  prNumber,
  checkId,
}: CheckTargetOptions): void => {
  if (testRunId != null && prNumber != null) {
    throw new CliUserError("Pass only one of --testRunId and --prNumber.");
  }
  if (testRunId == null && prNumber == null) {
    throw new CliUserError("Pass either --testRunId or --prNumber.");
  }
  if (testRunId != null) {
    requireIdArgument("testRunId", testRunId);
  }
  requireIdArgument("checkId", checkId);
};

export const resolveCheckTarget = async (
  client: MeticulousClient,
  { testRunId, prNumber, project, checkId, checkType }: CheckTargetOptions,
): Promise<CheckTarget> => {
  if (testRunId != null) {
    return { testRunId, checkId, checkType };
  }
  if (prNumber == null) {
    throw new CliUserError("Pass either --testRunId or --prNumber.");
  }
  const resolved = await resolveTestRunForPullRequestOrThrow(
    client,
    prNumber,
    project,
  );
  return { testRunId: resolved.testRunId, checkId, checkType };
};
