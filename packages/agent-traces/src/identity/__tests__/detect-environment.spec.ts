import { describe, expect, it } from "vitest";
import { detectEnvironment } from "../detect-environment";

describe("detectEnvironment", () => {
  it.each([
    [{}, "local", null],
    [
      { CLAUDE_CODE_REMOTE: "true", CLAUDE_CODE_REMOTE_SESSION_ID: "cse_1" },
      "claude-code-web",
      "cse_1",
    ],
    [
      { CONDUCTOR_WORKSPACE_ID: "ws-1", CONDUCTOR_IS_LOCAL: "0" },
      "conductor-cloud",
      "ws-1",
    ],
    [
      { CONDUCTOR_WORKSPACE_ID: "ws-2", CONDUCTOR_IS_LOCAL: "1" },
      "conductor-local",
      "ws-2",
    ],
    [{ CURSOR_AGENT_SOCKET: "/run/cursor/api.sock" }, "cursor-cloud", null],
    [{ GITHUB_ACTIONS: "true", GITHUB_RUN_ID: "42" }, "github-actions", "42"],
    [{ CI: "1" }, "ci", null],
    [{ CI: "false" }, "local", null],
  ])("detects %j as %s", (env, environment, environmentId) => {
    expect(detectEnvironment(env)).toEqual({ environment, environmentId });
  });

  it("prefers an explicit override, for products that don't identify themselves", () => {
    expect(
      detectEnvironment({
        METICULOUS_AGENT_TRACES_ENVIRONMENT: "devin-cloud",
        METICULOUS_AGENT_TRACES_ENVIRONMENT_ID: "devin-123",
        CONDUCTOR_WORKSPACE_ID: "ws-1",
      }),
    ).toEqual({ environment: "devin-cloud", environmentId: "devin-123" });
  });
});
