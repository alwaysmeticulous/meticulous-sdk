import { getScreenshotIdentifier } from "../get-screenshot-identifier";

describe("get-screenshot-identifier", () => {
  it("can parse identifiers without version numbers", () => {
    expect(getScreenshotIdentifier("final-state.png")).toEqual({
      type: "end-state",
    });
    expect(getScreenshotIdentifier("screenshot-after-event-7.png")).toEqual({
      type: "after-event",
      eventNumber: 7,
    });
  });

  it("can parse identifiers with version numbers", () => {
    expect(getScreenshotIdentifier("final-state-v2.png")).toEqual({
      type: "end-state",
      logicVersion: 2,
    });
    expect(getScreenshotIdentifier("screenshot-after-event-7-v2.png")).toEqual({
      type: "after-event",
      eventNumber: 7,
      logicVersion: 2,
    });
  });
});
