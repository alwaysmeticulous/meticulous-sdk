import type { AgentSwarmCaseResponse } from "@alwaysmeticulous/client";

/**
 * The case's `key:\tvalue` lines, keyed by the `--json` path of each field
 * (`steps[0]`, `check.verdict`). A list item is one line summarising that item.
 * Absent optional fields produce no line, matching their omission from the
 * `--json` object.
 */
export const formatSwarmRunCase = (
  testCase: AgentSwarmCaseResponse,
): string[] => {
  const lines: string[] = [];
  const add = (key: string, value: string | number | undefined): void => {
    const cell = toCell(value);
    if (cell !== "") {
      lines.push(`${key}:\t${cell}`);
    }
  };
  add("swarmRunId", testCase.swarmRunId);
  add("caseIndex", testCase.caseIndex);
  add("title", testCase.title);
  add("status", testCase.status);
  add("blockedBy", testCase.blockedBy);
  add("outcomeSummary", testCase.outcomeSummary);
  add("diagnosis", testCase.diagnosis);
  add("rationale", testCase.rationale);
  testCase.steps.forEach((step, index) =>
    add(
      `steps[${index}]`,
      joinParts([step.outcome ?? "-", step.description, step.reason]),
    ),
  );
  testCase.comparisons.forEach((comparison, index) =>
    add(
      `comparisons[${index}]`,
      `${comparison.screenshotName}: ${joinParts([comparison.verdict, comparison.explanation])}`,
    ),
  );
  const evidence = testCase.runEvidence;
  if (evidence != null) {
    add("runEvidence.backendFailureCount", evidence.backendFailureCount);
    evidence.backendFailures.forEach((failure, index) =>
      add(
        `runEvidence.backendFailures[${index}]`,
        `${failure.method} ${failure.endpoint}: ${failure.kind}` +
          (failure.status == null ? "" : ` ${failure.status}`) +
          (failure.count > 1 ? ` (x${failure.count})` : ""),
      ),
    );
    evidence.pageErrors.forEach((pageError, index) =>
      add(`runEvidence.pageErrors[${index}]`, pageError),
    );
  }
  const check = testCase.check;
  if (check != null) {
    add("check.verdict", check.verdict);
    add("check.confidence", check.confidence);
    add("check.headline", check.headline);
    add("check.reason", check.reason);
    add("check.linkedToChange", check.linkedToChange);
    add("check.linkedToChangeRationale", check.linkedToChangeRationale);
  }
  add("checkWithheld", testCase.checkWithheld);
  add("sessionIds", testCase.sessionIds.join(","));
  return lines;
};

const joinParts = (parts: Array<string | undefined>): string =>
  parts.filter((part) => part != null && part !== "").join(" — ");

/** Keeps a free-text value on its own line. */
const toCell = (value: string | number | undefined): string =>
  value == null ? "" : String(value).replace(/\s+/g, " ").trim();
