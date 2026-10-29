import { describe, expect, it } from "vitest";
import { resolveLogLevel } from "../log-level-options";

describe("resolveLogLevel", () => {
  it("keeps the groups' warn default without --verbose", () => {
    expect(
      resolveLogLevel({ logLevel: "warn", verbose: false, quiet: false }),
    ).toBe("warn");
  });

  it("maps --verbose to info over the warn default", () => {
    expect(
      resolveLogLevel({ logLevel: "warn", verbose: true, quiet: false }),
    ).toBe("info");
  });

  it.each(["trace", "debug", "error", "silent"])(
    "lets an explicit --logLevel %s win over --verbose",
    (logLevel) => {
      expect(resolveLogLevel({ logLevel, verbose: true, quiet: false })).toBe(
        logLevel,
      );
    },
  );

  it("quietens to warn with --json when no level is set", () => {
    expect(
      resolveLogLevel({ logLevel: undefined, verbose: false, quiet: true }),
    ).toBe("warn");
  });

  it("leaves the level unset by default outside the agent groups", () => {
    expect(
      resolveLogLevel({ logLevel: undefined, verbose: false, quiet: false }),
    ).toBeUndefined();
  });

  it("lets an explicit --logLevel win over --json", () => {
    expect(
      resolveLogLevel({ logLevel: "debug", verbose: false, quiet: true }),
    ).toBe("debug");
  });
});
