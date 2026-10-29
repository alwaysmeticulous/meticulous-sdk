import { describe, expect, it } from "vitest";
import { parseNthChildPath } from "../agent-screenshot-dom.utils";

describe("parseNthChildPath", () => {
  it.each([
    ["0,2,1", [0, 2, 1]],
    [" 0 , 2 ", [0, 2]],
    ["[0, 2, 1]", [0, 2, 1]],
    ["", []],
    ["[]", []],
  ])("reads %j as %j", (raw, expected) => {
    expect(parseNthChildPath(raw)).toEqual(expected);
  });

  it.each([null, undefined])("leaves %j unset", (raw) => {
    expect(parseNthChildPath(raw)).toBeUndefined();
  });

  it("reads a part that isn't a non-negative integer as NaN", () => {
    expect(parseNthChildPath("0,a")).toEqual([0, NaN]);
    expect(parseNthChildPath("0,,1")).toEqual([0, NaN, 1]);
    expect(parseNthChildPath("-1")).toEqual([NaN]);
    expect(parseNthChildPath("1.5")).toEqual([NaN]);
  });

  it("reads anything but a string, such as a repeated parameter, as [NaN]", () => {
    expect(parseNthChildPath(["0", "1"])).toEqual([NaN]);
    expect(parseNthChildPath(3)).toEqual([NaN]);
  });
});
