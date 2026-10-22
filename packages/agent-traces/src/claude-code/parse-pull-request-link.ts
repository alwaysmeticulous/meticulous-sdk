import type { AgentTracePullRequest } from "../types/summary.types";
import type { JsonRecord } from "../utils/json-guards";
import { asNonEmptyString, asNumber } from "../utils/json-guards";

/** Parses a `pr-link` line, which Claude Code writes when it opens or pushes to a PR. */
export const parsePullRequestLink = (
  line: JsonRecord,
): AgentTracePullRequest | null => {
  const number = asNumber(line["prNumber"]);
  const url = asNonEmptyString(line["prUrl"]);
  if (number === null || url === null) {
    return null;
  }
  return {
    number,
    url,
    repository: asNonEmptyString(line["prRepository"]),
  };
};
