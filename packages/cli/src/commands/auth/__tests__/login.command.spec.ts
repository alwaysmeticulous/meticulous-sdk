import { beforeEach, describe, expect, it, vi } from "vitest";
import { CliUserError } from "../../../utils/cli-user-error";
import { loginCommand } from "../login.command";

vi.mock("../../../command-utils/sentry.utils", () => ({
  wrapHandler: (fn: (...args: unknown[]) => Promise<void>) => fn,
}));

const loggerMock = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

vi.mock("@alwaysmeticulous/common", () => ({
  initLogger: () => loggerMock,
}));

const mocks = vi.hoisted(() => ({
  clearStoredProject: vi.fn(),
  createClient: vi.fn(),
  isInteractiveContext: vi.fn(),
  performOAuthLogin: vi.fn(),
  selectAndStoreProject: vi.fn(),
}));

vi.mock("@alwaysmeticulous/client", () => ({
  clearStoredProject: mocks.clearStoredProject,
  createClient: mocks.createClient,
  isInteractiveContext: mocks.isInteractiveContext,
  performOAuthLogin: mocks.performOAuthLogin,
}));

vi.mock("../../../utils/select-project", () => ({
  selectAndStoreProject: mocks.selectAndStoreProject,
}));

const runHandler = (args: { project?: string } = {}) =>
  (loginCommand as { handler: (args: unknown) => Promise<void> }).handler(args);

describe("login command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockReturnValue({});
    mocks.performOAuthLogin.mockResolvedValue({ accessToken: "fresh-jwt" });
    mocks.selectAndStoreProject.mockResolvedValue("Org/App");
  });

  it("throws a CliUserError in a non-interactive context and does not log in", async () => {
    mocks.isInteractiveContext.mockReturnValue(false);

    await expect(runHandler()).rejects.toBeInstanceOf(CliUserError);
    expect(mocks.performOAuthLogin).not.toHaveBeenCalled();
    expect(mocks.clearStoredProject).not.toHaveBeenCalled();
  });

  it("logs in first, then clears the stale project and selects one", async () => {
    mocks.isInteractiveContext.mockReturnValue(true);

    await runHandler();

    // The stale project is cleared only after a successful login, never before.
    expect(mocks.performOAuthLogin.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.clearStoredProject.mock.invocationCallOrder[0],
    );
    expect(mocks.createClient).toHaveBeenCalledWith({ apiToken: "fresh-jwt" });
    expect(mocks.selectAndStoreProject).toHaveBeenCalledWith(
      expect.objectContaining({ project: undefined }),
    );
  });

  it("preserves the existing session when the browser login fails", async () => {
    mocks.isInteractiveContext.mockReturnValue(true);
    mocks.performOAuthLogin.mockRejectedValue(new Error("login cancelled"));

    await expect(runHandler()).rejects.toThrow("login cancelled");
    expect(mocks.clearStoredProject).not.toHaveBeenCalled();
    expect(mocks.selectAndStoreProject).not.toHaveBeenCalled();
  });

  it("passes an explicit --project through to selection", async () => {
    mocks.isInteractiveContext.mockReturnValue(true);

    await runHandler({ project: "Org/App" });

    expect(mocks.selectAndStoreProject).toHaveBeenCalledWith(
      expect.objectContaining({ project: "Org/App" }),
    );
  });
});
