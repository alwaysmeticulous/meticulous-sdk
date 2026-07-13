import { describe, expect, it } from "vitest";

import {
  screenshotIdentifierToBackendName,
  screenshotIdentifierToBaseName,
} from "./screenshot-identifier";

describe("screenshotIdentifierToBackendName", () => {
  it("names end-state and after-event screenshots", () => {
    expect(screenshotIdentifierToBackendName({ type: "end-state" })).toBe(
      "end-state",
    );
    expect(
      screenshotIdentifierToBackendName({
        type: "after-event",
        eventNumber: 5,
      }),
    ).toBe("after-event-5");
  });

  it("names auxiliary screenshots (matching the backend getScreenshotName)", () => {
    expect(
      screenshotIdentifierToBackendName({
        type: "auxiliary",
        eventNumber: 291,
        sequenceNumber: 0,
        reason: "exit_animation",
      }),
    ).toBe("auxiliary-291-0-exit_animation");
  });

  it("returns null for redacted variants", () => {
    expect(
      screenshotIdentifierToBackendName({
        type: "after-event",
        eventNumber: 5,
        variant: "redacted",
      }),
    ).toBeNull();
  });
});

describe("screenshotIdentifierToBaseName", () => {
  it("derives the on-disk basename for auxiliary screenshots", () => {
    // Must match @alwaysmeticulous/screenshot-utils getScreenshotFilename
    // (without the .png extension): zero-padded event/sequence indices.
    expect(
      screenshotIdentifierToBaseName({
        type: "auxiliary",
        eventNumber: 291,
        sequenceNumber: 0,
        reason: "exit_animation",
      }),
    ).toBe("screenshot-auxiliary-00291-00000-exit_animation");
  });

  it("includes the end- prefix for end-state-anchored auxiliaries", () => {
    expect(
      screenshotIdentifierToBaseName({
        type: "auxiliary",
        eventNumber: 291,
        sequenceNumber: 2,
        reason: "exit_animation",
        endState: true,
      }),
    ).toBe("screenshot-auxiliary-00291-end-00002-exit_animation");
  });
});
