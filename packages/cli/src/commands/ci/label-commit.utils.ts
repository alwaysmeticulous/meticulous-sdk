import {
  COMMIT_LABEL_TYPES,
  type CommitLabelType,
} from "@alwaysmeticulous/client";
import { CliUserError } from "../../utils/cli-user-error";

/**
 * Validates the `--labels` values against the supported commit label types,
 * throwing a `CliUserError` for any unsupported ones (the backend re-validates
 * server-side). Returns the deduplicated labels.
 */
export const validateCommitLabels = (labels: string[]): CommitLabelType[] => {
  const unsupportedLabels = labels.filter(
    (label) => !(COMMIT_LABEL_TYPES as readonly string[]).includes(label),
  );
  if (unsupportedLabels.length > 0) {
    throw new CliUserError(
      `Unsupported label(s): ${unsupportedLabels.join(", ")}. ` +
        `Supported labels: ${COMMIT_LABEL_TYPES.join(", ")}.`,
    );
  }
  return [...new Set(labels as CommitLabelType[])];
};
