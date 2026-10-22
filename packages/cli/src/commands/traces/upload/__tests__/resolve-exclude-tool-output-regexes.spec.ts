import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CliUserError } from "../../../../utils/cli-user-error";
import { resolveExcludeToolOutputRegexes } from "../resolve-exclude-tool-output-regexes";

describe("resolveExcludeToolOutputRegexes", () => {
  const originalHome = process.env["HOME"];
  let home = "";

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "traces-home-"));
    process.env["HOME"] = home;
  });

  afterEach(() => {
    process.env["HOME"] = originalHome;
  });

  const writeUserConfig = (config: unknown) => {
    mkdirSync(join(home, ".meticulous"));
    writeFileSync(
      join(home, ".meticulous", "traces-config.json"),
      JSON.stringify(config),
    );
  };

  it("combines the flags with the user's config", () => {
    writeUserConfig({ excludeToolOutputRegex: "^mcp__crm__" });

    expect(
      resolveExcludeToolOutputRegexes(["^Read$"]).map((regex) => regex.source),
    ).toEqual(["^Read$", "^mcp__crm__"]);
  });

  it("refuses an invalid flag or config rather than uploading outputs", () => {
    expect(() => resolveExcludeToolOutputRegexes(["("])).toThrow(CliUserError);

    writeUserConfig({ excludeToolOutputRegex: "(" });
    expect(() => resolveExcludeToolOutputRegexes([])).toThrow(
      /traces-config\.json/,
    );
  });
});
