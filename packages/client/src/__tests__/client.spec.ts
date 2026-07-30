import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildUserAgent, declareClientAppInfo } from "../client";
import { VERSION } from "../version";

const ENV_VAR = "METICULOUS_CLIENT_USER_AGENT_SUFFIX";
const BASE = `@alwaysmeticulous/client/${VERSION}`;

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

describe("buildUserAgent", () => {
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

describe("declareClientAppInfo", () => {
  it("labels every subsequently built user-agent", () => {
    declareClientAppInfo("cli");
    expect(buildUserAgent()).toBe(`${BASE} cli`);
  });

  it("leaves an identity already in the environment untouched", () => {
    // An outer consumer that labelled the process (e.g. a GitHub Action
    // invoking the CLI) keeps its attribution.
    process.env[ENV_VAR] = "report-diffs-action/cloud-compute@v1";
    declareClientAppInfo("cli");
    expect(buildUserAgent()).toBe(
      `${BASE} report-diffs-action/cloud-compute@v1`,
    );
  });

  it("treats a blank environment value as absent", () => {
    // A blank suffix is discarded by buildUserAgent, so leaving it in place
    // would suppress the label entirely.
    process.env[ENV_VAR] = "   ";
    declareClientAppInfo("agent-cloud-worker");
    expect(buildUserAgent()).toBe(`${BASE} agent-cloud-worker`);
  });

  it("does not override an explicit appInfo option", () => {
    declareClientAppInfo("cli");
    expect(buildUserAgent("my-app/custom-checks")).toBe(
      `${BASE} my-app/custom-checks`,
    );
  });
});
