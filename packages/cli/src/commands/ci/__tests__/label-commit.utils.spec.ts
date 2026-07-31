import { describe, expect, it } from "vitest";
import { CliUserError } from "../../../utils/cli-user-error";
import { validateCommitLabels } from "../label-commit.utils";

describe("validateCommitLabels", () => {
  it("accepts supported labels", () => {
    expect(validateCommitLabels(["not-relevant"])).toEqual(["not-relevant"]);
  });

  it("deduplicates labels", () => {
    expect(validateCommitLabels(["not-relevant", "not-relevant"])).toEqual([
      "not-relevant",
    ]);
  });

  it("rejects unsupported labels", () => {
    expect(() => validateCommitLabels(["not-relevant", "flaky"])).toThrow(
      CliUserError,
    );
    expect(() => validateCommitLabels(["flaky"])).toThrow(
      "Unsupported label(s): flaky. Supported labels: not-relevant.",
    );
  });
});
