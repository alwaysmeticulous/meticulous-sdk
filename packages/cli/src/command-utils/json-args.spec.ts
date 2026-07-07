import { describe, expect, it } from "vitest";
import { parseJsonArgs } from "./json-args";
import { CliUserError } from "../utils/cli-user-error";

const KNOWN = new Set(["apiToken", "json"]);

describe("parseJsonArgs", () => {
  it("parses a JSON object of known keys into a record", () => {
    expect(parseJsonArgs('{"apiToken":"abc","json":true}', KNOWN)).toEqual({
      apiToken: "abc",
      json: true,
    });
  });

  it("throws a CliUserError (not a raw SyntaxError) for malformed JSON", () => {
    expect(() => parseJsonArgs("{bad}", KNOWN)).toThrow(CliUserError);
    expect(() => parseJsonArgs("{bad}", KNOWN)).toThrow(/valid JSON string/);
  });

  it("rejects non-object JSON (array, primitive)", () => {
    expect(() => parseJsonArgs("[1,2,3]", KNOWN)).toThrow(CliUserError);
    expect(() => parseJsonArgs('"a string"', KNOWN)).toThrow(/JSON object/);
    expect(() => parseJsonArgs("null", KNOWN)).toThrow(/JSON object/);
  });

  it("rejects any key that is not a known option", () => {
    expect(() => parseJsonArgs('{"notAnOption":1}', KNOWN)).toThrow(
      /unknown option "notAnOption"/,
    );
  });

  it("rejects prototype-polluting keys (they are never known options)", () => {
    expect(() =>
      parseJsonArgs('{"__proto__":{"polluted":true}}', KNOWN),
    ).toThrow(/unknown option "__proto__"/);
    expect(() => parseJsonArgs('{"constructor":{}}', KNOWN)).toThrow(
      /unknown option "constructor"/,
    );
    // A valid object of known keys must still parse and keep a clean prototype.
    const parsed = parseJsonArgs('{"apiToken":"abc"}', KNOWN);
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
  });
});
