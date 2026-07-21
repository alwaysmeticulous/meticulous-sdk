import { describe, expect, test } from "vitest";
import {
  parseMaxDurationSecondsArg,
  shouldRejectMaxDurationWithoutSessionIds,
  shouldSkipAsNothingToTest,
  shouldWarnOfHeadDrift,
} from "./trigger-test-run.command";

describe("shouldSkipAsNothingToTest", () => {
  test("skips in --commitSha mode when base equals head with no diff", () => {
    expect(
      shouldSkipAsNothingToTest({
        commitSha: "sha-1",
        effectiveHead: "sha-1",
        baseSha: "sha-1",
        gitDiffOutput: undefined,
        hasPinnedSessionIds: false,
      }),
    ).toBe(true);
  });

  test("does not skip in --deploymentId mode (commitSha undefined), even when base equals head", () => {
    // An empty local diff is only a proxy for the deployment's actual
    // commit — the backend may already have a diff uploaded separately for
    // this deployment and base, so the CLI must not short-circuit locally.
    expect(
      shouldSkipAsNothingToTest({
        commitSha: undefined,
        effectiveHead: "headsha",
        baseSha: "headsha",
        gitDiffOutput: undefined,
        hasPinnedSessionIds: false,
      }),
    ).toBe(false);
  });

  test("does not skip when a diff is present", () => {
    expect(
      shouldSkipAsNothingToTest({
        commitSha: "sha-1",
        effectiveHead: "sha-1",
        baseSha: "sha-1",
        gitDiffOutput: "some diff",
        hasPinnedSessionIds: false,
      }),
    ).toBe(false);
  });

  test("does not skip when sessionIds are pinned (deliberate head-only re-run)", () => {
    expect(
      shouldSkipAsNothingToTest({
        commitSha: "sha-1",
        effectiveHead: "sha-1",
        baseSha: "sha-1",
        gitDiffOutput: undefined,
        hasPinnedSessionIds: true,
      }),
    ).toBe(false);
  });

  test("does not skip when base and head differ", () => {
    expect(
      shouldSkipAsNothingToTest({
        commitSha: "sha-1",
        effectiveHead: "sha-1",
        baseSha: "base-sha",
        gitDiffOutput: undefined,
        hasPinnedSessionIds: false,
      }),
    ).toBe(false);
  });
});

describe("shouldWarnOfHeadDrift", () => {
  test("warns when the computed head differs from the deployment's actual commit", () => {
    expect(
      shouldWarnOfHeadDrift({
        headIsEphemeral: false,
        head: "headsha",
        headCommitSha: "differentsha",
      }),
    ).toBe(true);
  });

  test("does not warn when they match", () => {
    expect(
      shouldWarnOfHeadDrift({
        headIsEphemeral: false,
        head: "headsha",
        headCommitSha: "headsha",
      }),
    ).toBe(false);
  });

  test("does not warn for an ephemeral head (stash SHA differs across invocations by design)", () => {
    expect(
      shouldWarnOfHeadDrift({
        headIsEphemeral: true,
        head: "stashsha",
        headCommitSha: "differentsha",
      }),
    ).toBe(false);
  });

  test("does not warn when head is unknown (explicit --gitDiffOutput was passed)", () => {
    expect(
      shouldWarnOfHeadDrift({
        headIsEphemeral: false,
        head: undefined,
        headCommitSha: "anysha",
      }),
    ).toBe(false);
  });
});

describe("parseMaxDurationSecondsArg", () => {
  test("returns undefined when omitted", () => {
    expect(parseMaxDurationSecondsArg(undefined)).toBeUndefined();
  });

  test("parses a positive integer string", () => {
    expect(parseMaxDurationSecondsArg("120")).toBe(120);
  });

  test("returns null for 'none'", () => {
    expect(parseMaxDurationSecondsArg("none")).toBeNull();
  });

  test("returns null for 'NONE' (case-insensitive)", () => {
    expect(parseMaxDurationSecondsArg("NONE")).toBeNull();
  });

  test("throws on '0' ('none' is the only unlimited spelling)", () => {
    expect(() => parseMaxDurationSecondsArg("0")).toThrow(
      /must be a positive integer/,
    );
  });

  test("throws on a non-numeric value", () => {
    expect(() => parseMaxDurationSecondsArg("abc")).toThrow(
      /must be a positive integer/,
    );
  });

  test("throws on a negative value", () => {
    expect(() => parseMaxDurationSecondsArg("-5")).toThrow(
      /must be a positive integer/,
    );
  });

  test("throws on a non-integer value", () => {
    expect(() => parseMaxDurationSecondsArg("5.5")).toThrow(
      /must be a positive integer/,
    );
  });

  test("throws on an empty string", () => {
    expect(() => parseMaxDurationSecondsArg("")).toThrow(
      /must be a positive integer/,
    );
  });
});

describe("shouldRejectMaxDurationWithoutSessionIds", () => {
  test("rejects when maxDurationSeconds is set without pinned sessionIds", () => {
    expect(
      shouldRejectMaxDurationWithoutSessionIds({
        maxDurationSeconds: 120,
        hasPinnedSessionIds: false,
      }),
    ).toBe(true);
  });

  test("rejects an explicit unlimited (null) without pinned sessionIds", () => {
    expect(
      shouldRejectMaxDurationWithoutSessionIds({
        maxDurationSeconds: null,
        hasPinnedSessionIds: false,
      }),
    ).toBe(true);
  });

  test("allows maxDurationSeconds when sessionIds are pinned", () => {
    expect(
      shouldRejectMaxDurationWithoutSessionIds({
        maxDurationSeconds: 120,
        hasPinnedSessionIds: true,
      }),
    ).toBe(false);
  });

  test("allows omitting maxDurationSeconds regardless of sessionIds", () => {
    expect(
      shouldRejectMaxDurationWithoutSessionIds({
        maxDurationSeconds: undefined,
        hasPinnedSessionIds: false,
      }),
    ).toBe(false);
  });
});
