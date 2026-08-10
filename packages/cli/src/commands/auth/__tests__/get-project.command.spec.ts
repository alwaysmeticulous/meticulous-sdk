import { beforeEach, describe, expect, it, vi } from "vitest";
import { CliUserError } from "../../../utils/cli-user-error";
import { getProjectCommand } from "../get-project.command";

vi.mock("../../../command-utils/sentry.utils", () => ({
  wrapHandler: (fn: (...args: unknown[]) => Promise<void>) => fn,
}));

const mocks = vi.hoisted(() => ({
  createClientWithOAuth: vi.fn(),
  getAgentCurrentProject: vi.fn(),
  isFetchError: vi.fn(),
  isAuthFailureStatus: vi.fn(),
  getStoredOAuthTokens: vi.fn(),
  isJwtExpired: vi.fn(),
  clearOAuthTokens: vi.fn(),
}));

vi.mock("@alwaysmeticulous/common", () => ({
  initLogger: vi.fn(),
}));

vi.mock("@alwaysmeticulous/client", () => ({
  createClientWithOAuth: mocks.createClientWithOAuth,
  getAgentCurrentProject: mocks.getAgentCurrentProject,
  isFetchError: mocks.isFetchError,
  isAuthFailureStatus: mocks.isAuthFailureStatus,
  getStoredOAuthTokens: mocks.getStoredOAuthTokens,
  isJwtExpired: mocks.isJwtExpired,
  clearOAuthTokens: mocks.clearOAuthTokens,
  MISSING_AUTH_GUIDANCE: "guidance",
}));

const runHandler = (args: { json?: boolean } = {}) =>
  (getProjectCommand as { handler: (args: unknown) => Promise<void> }).handler({
    json: false,
    ...args,
  });

let logSpy: ReturnType<typeof vi.spyOn>;
const stdoutText = () => logSpy.mock.calls.flat().join("\n");

describe("get-project command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClientWithOAuth.mockResolvedValue({});
    mocks.isFetchError.mockReturnValue(false);
    mocks.isAuthFailureStatus.mockReturnValue(false);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("prints the bare slug so the output can be piped", async () => {
    mocks.getAgentCurrentProject.mockResolvedValue({
      project: "Org/App",
      projectId: "proj-1",
      source: "user-default",
    });

    await runHandler();

    expect(stdoutText()).toBe("Org/App");
  });

  it("reports where the project came from with --json", async () => {
    mocks.getAgentCurrentProject.mockResolvedValue({
      project: "Org/App",
      projectId: "proj-1",
      source: "api-token",
    });

    await runHandler({ json: true });

    expect(JSON.parse(stdoutText())).toEqual({
      project: "Org/App",
      projectId: "proj-1",
      source: "api-token",
    });
  });

  // The backend is the only side that knows why there is no project, so its
  // message is surfaced verbatim rather than re-derived here.
  it("surfaces the backend's explanation when no project resolves", async () => {
    mocks.isFetchError.mockReturnValue(true);
    mocks.getAgentCurrentProject.mockRejectedValue({
      response: {
        status: 400,
        data: { message: "No default project is set." },
      },
    });

    await expect(runHandler()).rejects.toThrow("No default project is set.");
    await expect(runHandler()).rejects.toBeInstanceOf(CliUserError);
  });
});
