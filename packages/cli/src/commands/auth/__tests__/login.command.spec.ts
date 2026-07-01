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
  getStoredProject: vi.fn(),
  isInteractiveContext: vi.fn(),
  performOAuthLogin: vi.fn(),
  selectAndStoreProject: vi.fn(),
}));

vi.mock("@alwaysmeticulous/client", () => ({
  clearStoredProject: mocks.clearStoredProject,
  createClient: mocks.createClient,
  getStoredProject: mocks.getStoredProject,
  isInteractiveContext: mocks.isInteractiveContext,
  performOAuthLogin: mocks.performOAuthLogin,
}));

vi.mock("../../../utils/select-project", () => ({
  selectAndStoreProject: mocks.selectAndStoreProject,
}));

const runHandler = (
  args: { project?: string; nonInteractive?: boolean } = {},
) =>
  (loginCommand as { handler: (args: unknown) => Promise<void> }).handler(args);

describe("login command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockReturnValue({});
    mocks.getStoredProject.mockReturnValue(null);
    mocks.performOAuthLogin.mockResolvedValue({ accessToken: "fresh-jwt" });
    mocks.selectAndStoreProject.mockResolvedValue("Org/App");
  });

  it("throws a CliUserError in a non-interactive context and does not log in", async () => {
    mocks.isInteractiveContext.mockReturnValue(false);

    await expect(runHandler()).rejects.toBeInstanceOf(CliUserError);
    expect(mocks.performOAuthLogin).not.toHaveBeenCalled();
    expect(mocks.clearStoredProject).not.toHaveBeenCalled();
  });

  it("with --non-interactive, bypasses the TTY guard and runs headlessly", async () => {
    mocks.isInteractiveContext.mockReturnValue(false);

    await runHandler({ nonInteractive: true });

    expect(mocks.performOAuthLogin).toHaveBeenCalledWith({
      openBrowserAutomatically: false,
    });
    expect(mocks.selectAndStoreProject).toHaveBeenCalledWith(
      expect.objectContaining({ allowInteractivePrompt: false }),
    );
  });

  it("with --non-interactive on a real TTY, still prints the URL and skips the picker", async () => {
    mocks.isInteractiveContext.mockReturnValue(true);

    await runHandler({ nonInteractive: true });

    expect(mocks.performOAuthLogin).toHaveBeenCalledWith({
      openBrowserAutomatically: false,
    });
    expect(mocks.selectAndStoreProject).toHaveBeenCalledWith(
      expect.objectContaining({ allowInteractivePrompt: false }),
    );
  });

  it("passes the previously-selected project as a fallback for headless selection", async () => {
    mocks.isInteractiveContext.mockReturnValue(false);
    mocks.getStoredProject.mockReturnValue("Org/Previous");
    mocks.selectAndStoreProject.mockResolvedValue("Org/Previous");

    await runHandler({ nonInteractive: true });

    expect(mocks.selectAndStoreProject).toHaveBeenCalledWith(
      expect.objectContaining({ fallbackToProject: "Org/Previous" }),
    );
  });

  it("propagates the error and skips the hint when no project could be selected", async () => {
    mocks.isInteractiveContext.mockReturnValue(false);
    mocks.selectAndStoreProject.mockRejectedValue(
      new CliUserError("no project selected", 1, "warn"),
    );

    await expect(runHandler({ nonInteractive: true })).rejects.toBeInstanceOf(
      CliUserError,
    );
    expect(loggerMock.info).not.toHaveBeenCalledWith(
      expect.stringContaining("auth set-project"),
    );
  });

  it("shows the change-project hint when a project was selected", async () => {
    mocks.isInteractiveContext.mockReturnValue(true);

    await runHandler();

    expect(loggerMock.info).toHaveBeenCalledWith(
      expect.stringContaining("auth set-project"),
    );
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
