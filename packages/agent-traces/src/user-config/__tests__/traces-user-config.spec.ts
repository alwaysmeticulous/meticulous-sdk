import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  loadTracesUserConfig,
  parseTracesUserConfig,
} from "../traces-user-config";

describe("parseTracesUserConfig", () => {
  it("defaults to enabled with no repo filter when the file or keys are missing", () => {
    expect(parseTracesUserConfig(null)).toEqual({
      config: {
        enabled: true,
        allowedRepoRegex: null,
        excludeToolOutputRegex: null,
      },
      problems: [],
    });
    expect(parseTracesUserConfig('{"other": 1}')).toEqual({
      config: {
        enabled: true,
        allowedRepoRegex: null,
        excludeToolOutputRegex: null,
      },
      problems: [],
    });
  });

  it("reads explicit values", () => {
    expect(parseTracesUserConfig('{"enabled": false}').config).toEqual({
      enabled: false,
      allowedRepoRegex: null,
      excludeToolOutputRegex: null,
    });
    expect(parseTracesUserConfig('{"enabled": true}').config).toEqual({
      enabled: true,
      allowedRepoRegex: null,
      excludeToolOutputRegex: null,
    });
    expect(parseTracesUserConfig('{"allowedRepoRegex": null}').config).toEqual({
      enabled: true,
      allowedRepoRegex: null,
      excludeToolOutputRegex: null,
    });
    const { config, problems } = parseTracesUserConfig(
      JSON.stringify({ allowedRepoRegex: "github\\.com/acme/" }),
    );
    expect(problems).toEqual([]);
    expect(config.enabled).toBe(true);
    expect(config.allowedRepoRegex?.test("github.com/acme/shop")).toBe(true);
    expect(config.allowedRepoRegex?.test("github.com/other/shop")).toBe(false);
  });

  it("disables uploads when the file or a value is invalid", () => {
    expect(parseTracesUserConfig("{enabled: false")).toEqual({
      config: {
        enabled: false,
        allowedRepoRegex: null,
        excludeToolOutputRegex: null,
      },
      problems: ["not a JSON object"],
    });
    expect(parseTracesUserConfig("[]").config.enabled).toBe(false);
    expect(parseTracesUserConfig('{"enabled": "false"}')).toEqual({
      config: {
        enabled: false,
        allowedRepoRegex: null,
        excludeToolOutputRegex: null,
      },
      problems: ['"enabled" has an invalid value: "false"'],
    });
    expect(parseTracesUserConfig('{"allowedRepoRegex": "("}')).toEqual({
      config: {
        enabled: false,
        allowedRepoRegex: null,
        excludeToolOutputRegex: null,
      },
      problems: ['"allowedRepoRegex" has an invalid value: "("'],
    });
    expect(
      parseTracesUserConfig('{"allowedRepoRegex": ["a"]}').config.enabled,
    ).toBe(false);
  });

  it("reads excludeToolOutputRegex, and disables uploads when it's invalid", () => {
    const { config, problems } = parseTracesUserConfig(
      JSON.stringify({ excludeToolOutputRegex: "^mcp__salesforce__" }),
    );
    expect(problems).toEqual([]);
    expect(config.enabled).toBe(true);
    expect(config.excludeToolOutputRegex?.test("mcp__salesforce__query")).toBe(
      true,
    );
    expect(parseTracesUserConfig('{"excludeToolOutputRegex": "["}')).toEqual({
      config: {
        enabled: false,
        allowedRepoRegex: null,
        excludeToolOutputRegex: null,
      },
      problems: ['"excludeToolOutputRegex" has an invalid value: "["'],
    });
  });
});

describe("loadTracesUserConfig", () => {
  it("treats a missing file as defaults and reads an existing one", () => {
    const dir = mkdtempSync(join(tmpdir(), "at-user-config-"));
    const path = join(dir, "traces-config.json");
    expect(loadTracesUserConfig(path).config.enabled).toBe(true);
    writeFileSync(path, '{"enabled": false}');
    expect(loadTracesUserConfig(path).config.enabled).toBe(false);
  });

  it("disables uploads when the path can't be read", () => {
    const dir = mkdtempSync(join(tmpdir(), "at-user-config-"));
    const result = loadTracesUserConfig(dir);
    expect(result.config.enabled).toBe(false);
    expect(result.problems).toHaveLength(1);
  });
});
