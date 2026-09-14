import { describe, expect, test } from "vitest";
import { CliUserError } from "../../utils/cli-user-error";
import {
  requireArgument,
  requireIdArgument,
} from "./argument-validation.utils";

describe("requireArgument", () => {
  test("returns the value when one was given", () => {
    expect(requireArgument("reason", "Looks intentional")).toBe(
      "Looks intentional",
    );
  });

  test("accepts free text containing whitespace", () => {
    expect(requireArgument("text", "two words")).toBe("two words");
  });

  test("rejects a flag named without a value", () => {
    expect(() => requireArgument("screenshotName", "")).toThrow(CliUserError);
    expect(() => requireArgument("screenshotName", "")).toThrow(
      "--screenshotName was given no value.",
    );
  });

  test("rejects a blank value", () => {
    expect(() => requireArgument("reason", "   ")).toThrow(
      "--reason was given no value.",
    );
  });
});

describe("requireIdArgument", () => {
  test("returns the value when one was given", () => {
    expect(requireIdArgument("replayDiffId", "0M79GB8p")).toBe("0M79GB8p");
  });

  test("accepts a screenshot name", () => {
    expect(requireIdArgument("screenshotName", "after-event-82")).toBe(
      "after-event-82",
    );
  });

  test("rejects a flag named without a value", () => {
    expect(() => requireIdArgument("replayDiffId", "")).toThrow(
      "--replayDiffId was given no value.",
    );
  });

  test("rejects two arguments that arrived as one, naming the value", () => {
    expect(() =>
      requireIdArgument("replayDiffId", "0M79GB8p after-event-82"),
    ).toThrow(CliUserError);
    expect(() =>
      requireIdArgument("replayDiffId", "0M79GB8p after-event-82"),
    ).toThrow(/contains whitespace: "0M79GB8p after-event-82"/);
  });

  test("rejects a tab or newline as readily as a space", () => {
    expect(() => requireIdArgument("replayDiffId", "a\tb")).toThrow(
      /contains whitespace/,
    );
    expect(() => requireIdArgument("replayDiffId", "a\nb")).toThrow(
      /contains whitespace/,
    );
  });

  test("exits 1 without the generic help tip", () => {
    try {
      requireIdArgument("replayDiffId", "");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(CliUserError);
      expect((error as CliUserError).exitCode).toBe(1);
      expect((error as CliUserError).severity).toBe("error");
    }
  });
});
