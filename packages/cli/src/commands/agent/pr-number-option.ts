import { CliUserError } from "../../utils/cli-user-error";

/**
 * Rejects naming the run more than one way. Checked in the handler as well as
 * through the options' yargs `conflicts`, which can't be relied on alone once
 * an option has a default.
 */
export const assertSingleRunSelector = ({
  testRunId,
  prNumber,
  commitSha,
}: {
  testRunId: string | undefined;
  prNumber: number | undefined;
  commitSha: string | undefined;
}): void => {
  const given = [testRunId, prNumber, commitSha].filter(
    (value) => value != null,
  );
  if (given.length > 1) {
    throw new CliUserError(
      "Pass only one of --testRunId, --prNumber and --commitSha.",
    );
  }
};

const parsePrNumber = (value: number): number => {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("--prNumber must be a positive integer.");
  }
  return value;
};

/**
 * The `--prNumber` run selector shared by the agent commands that resolve a
 * test run: an alternative to `--testRunId` / `--commitSha`, so it conflicts
 * with both (plus any command-specific run selectors in `extraConflicts`).
 */
export const prNumberOption = (extraConflicts: string[] = []) => ({
  number: true as const,
  description:
    "A pull request number, used as an alternative to --testRunId: looks up the latest test run for the pull request's head commit, exactly as --commitSha would for that commit.",
  conflicts: ["testRunId", "commitSha", ...extraConflicts],
  coerce: parsePrNumber,
});
