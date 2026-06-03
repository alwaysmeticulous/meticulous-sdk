import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildUserAgent } from "../client";
import { VERSION } from "../version";

const ENV_VAR = "METICULOUS_CLIENT_USER_AGENT_SUFFIX";
const BASE = `@alwaysmeticulous/client/${VERSION}`;

describe("buildUserAgent", () => {
  let originalSuffix: string | undefined;

  beforeEach(() => {
    originalSuffix = process.env[ENV_VAR];
    delete process.env[ENV_VAR];
  });

  afterEach(() => {
    if (originalSuffix === undefined) {
      delete process.env[ENV_VAR];
    } else {
      process.env[ENV_VAR] = originalSuffix;
    }
  });

  it("returns the base user-agent when nothing is provided", () => {
    expect(buildUserAgent()).toBe(BASE);
  });

  it("appends the appInfo option", () => {
    expect(buildUserAgent("report-diffs-action/cloud-compute@v1")).toBe(
      `${BASE} report-diffs-action/cloud-compute@v1`,
    );
  });

  it("appends the env var suffix when no appInfo is given", () => {
    process.env[ENV_VAR] = "report-diffs-action@abc123";
    expect(buildUserAgent()).toBe(`${BASE} report-diffs-action@abc123`);
  });

  it("prefers the appInfo option over the env var", () => {
    process.env[ENV_VAR] = "from-env";
    expect(buildUserAgent("from-option")).toBe(`${BASE} from-option`);
  });

  it("falls back to the env var when appInfo is empty or whitespace", () => {
    process.env[ENV_VAR] = "from-env";
    expect(buildUserAgent("")).toBe(`${BASE} from-env`);
    expect(buildUserAgent("   ")).toBe(`${BASE} from-env`);
  });

  it("trims the suffix and ignores whitespace-only values", () => {
    expect(buildUserAgent("  report-diffs-action@v1  ")).toBe(
      `${BASE} report-diffs-action@v1`,
    );
    process.env[ENV_VAR] = "   ";
    expect(buildUserAgent()).toBe(BASE);
  });
});
