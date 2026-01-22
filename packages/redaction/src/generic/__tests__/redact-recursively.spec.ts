import { describe, expect, it, vi } from "vitest";
import { asterixOut } from "../asterix-out";
import { redactRecursively } from "../redact-recursively";

describe("redactRecursively", () => {
  it("redact nested strings", () => {
    expect(
      redactRecursively(
        {
          a: {
            b: {
              c: "hello",
              d: [{ e: "world" }],
            },
          },
        },
        {
          redactString: (str) => asterixOut(str),
        }
      )
    ).toEqual({
      a: {
        b: {
          c: "*****",
          d: [{ e: "*****" }],
        },
      },
    });
  });

  it("returns original object if no redaction performed", () => {
    const o = {
      a: {
        b: {
          c: "hello",
          d: [{ e: "world" }],
        },
      },
    };
    expect(
      redactRecursively(o, {
        redactString: (str, path) =>
          path.at(-1) === "i-do-not-exist" ? asterixOut(str) : str,
      })
    ).toBe(o);
  });

  it("passes the json path to the redaction function", () => {
    const redactString = vi.fn((str) => asterixOut(str));
    redactRecursively(
      {
        a: {
          b: {
            c: "hello",
            d: [{ e: "world" }],
          },
        },
      },
      {
        redactString,
      }
    );
    expect(redactString.mock.calls).toEqual([
      ["hello", ["a", "b", "c"]],
      ["world", ["a", "b", "d", "0", "e"]],
    ]);
  });

  it("can redact whole objects", () => {
    expect(
      redactRecursively(
        {
          a: {
            b: {
              c: { value: "hello" },
            },
            d: [{ e: "world" }],
          },
        },
        {
          redactObject: (value, jsonPath) =>
            jsonPath.length > 2 ? { redacted: true } : value,
        }
      )
    ).toEqual({
      a: {
        b: {
          c: { redacted: true },
        },
        d: [{ redacted: true }],
      },
    });
  });
});
