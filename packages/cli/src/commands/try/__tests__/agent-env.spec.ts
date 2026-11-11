import { describe, expect, it } from "vitest";
import { findAgentEnvProblems } from "../preflight/find-agent-env-problems";
import { buildAgentEnvScript, shellQuote } from "../shared/agent-env-script";
import {
  buildTryAgentEnv,
  readEndpointsFromEnv,
} from "../shared/try-agent-env";
import { dockerPrefixFor } from "../start/build-try-context";

const CONTEXT = {
  apiToken: "trial-token",
  endpoints: { apiUrl: null, snippetsBaseUrl: null },
  paths: { agentDataDir: "/repo/.meticulous-try/meticulous-home" },
} as const;

const problemsFor = (
  env: NodeJS.ProcessEnv,
  options: { oauthLoginStored?: boolean } = {},
) =>
  findAgentEnvProblems({
    context: CONTEXT,
    env,
    dataDir: "/repo/.meticulous-try/meticulous-home",
    oauthLoginStored: options.oauthLoginStored ?? false,
  });

describe("buildTryAgentEnv", () => {
  it("pins the token, a login-free data dir and the endpoints, with empty meaning the default", () => {
    expect(buildTryAgentEnv(CONTEXT)).toEqual({
      METICULOUS_API_TOKEN: "trial-token",
      METICULOUS_DIR: "/repo/.meticulous-try/meticulous-home",
      METICULOUS_API_URL: "",
      METICULOUS_SNIPPETS_BASE_URL: "",
    });
    expect(readEndpointsFromEnv(buildTryAgentEnv(CONTEXT))).toEqual(
      CONTEXT.endpoints,
    );
  });
});

describe("findAgentEnvProblems", () => {
  it("passes the environment the launcher sets up", () => {
    expect(problemsFor(buildTryAgentEnv(CONTEXT))).toEqual([]);
  });

  it("flags a stored login, another token and a different API URL, without printing tokens", () => {
    const problems = problemsFor(
      {
        ...buildTryAgentEnv(CONTEXT),
        METICULOUS_API_TOKEN: "other-project-token",
        METICULOUS_API_URL: "http://localhost:3000/api/",
      },
      { oauthLoginStored: true },
    );

    expect(problems).toHaveLength(3);
    expect(problems.join("\n")).toContain("OAuth login");
    expect(problems.join("\n")).toContain("http://localhost:3000/api/");
    expect(problems.join("\n")).not.toContain("other-project-token");
    expect(problems.join("\n")).not.toContain("trial-token");
  });
});

describe("buildAgentEnvScript", () => {
  it("exports the pinned env and reads the token from the context file", () => {
    const script = buildAgentEnvScript({
      pinnedEnv: { METICULOUS_DIR: "/it's here" },
      contextPath: "/repo/.meticulous-try/try-context.json",
    });

    expect(script).toContain(
      `export METICULOUS_DIR=${shellQuote("/it's here")}`,
    );
    expect(script).toContain("export METICULOUS_API_TOKEN");
    expect(script).not.toContain("trial-token");
  });
});

describe("dockerPrefixFor", () => {
  it("is a valid lowercase Docker name unique to the project", () => {
    expect(dockerPrefixFor("Ab12_cd")).toBe("meticulous-try-ab12-cd");
  });
});
