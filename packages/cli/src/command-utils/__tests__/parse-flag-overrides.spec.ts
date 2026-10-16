import { describe, expect, test } from "vitest";
import { CliUserError } from "../../utils/cli-user-error";
import { parseFlagOverrides } from "../parse-flag-overrides";

describe("parseFlagOverrides", () => {
  test("parses string and boolean values", () => {
    expect(
      parseFlagOverrides('{"my_flag": true, "my_experiment": "treatment"}'),
    ).toEqual({ my_flag: true, my_experiment: "treatment" });
  });

  test("accepts an empty object", () => {
    expect(parseFlagOverrides("{}")).toEqual({});
  });

  test.each(["not json", "[]", "null", "true", '"my_flag"'])(
    "rejects %s",
    (value) => {
      expect(() => parseFlagOverrides(value)).toThrow(CliUserError);
    },
  );

  test.each(['{"my_flag": 1}', '{"my_flag": null}', '{"my_flag": {}}'])(
    "rejects non-string, non-boolean value in %s",
    (value) => {
      expect(() => parseFlagOverrides(value)).toThrow(CliUserError);
    },
  );
});
