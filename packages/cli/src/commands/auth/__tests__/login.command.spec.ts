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

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  isInteractiveContext: vi.fn(),
  performOAuthLogin: vi.fn(),
  performDeviceLogin: vi.fn(),
  selectProjectOnLogin: vi.fn(),
  logNotice: vi.fn(),
}));

vi.mock("@alwaysmeticulous/common", () => ({
  initLogger: () => loggerMock,
  logNotice: mocks.logNotice,
}));

vi.mock("@alwaysmeticulous/client", () => ({
  createClient: mocks.createClient,
  isInteractiveContext: mocks.isInteractiveContext,
  performOAuthLogin: mocks.performOAuthLogin,
  performDeviceLogin: mocks.performDeviceLogin,
}));

vi.mock("../../../utils/select-project", () => ({
  selectProjectOnLogin: mocks.selectProjectOnLogin,
}));

const runHandler = (
  args: { project?: string; nonInteractive?: boolean; device?: boolean } = {},
) =>
  (loginCommand as { handler: (args: unknown) => Promise<void> }).handler(args);

describe("login command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockReturnValue({});
    mocks.performOAuthLogin.mockResolvedValue({ accessToken: "fresh-jwt" });
    mocks.performDeviceLogin.mockResolvedValue({ accessToken: "fresh-jwt" });
    mocks.selectProjectOnLogin.mockResolvedValue(undefined);
  });

  it("throws a CliUserError in a non-interactive context and does not log in", async () => {
    mocks.isInteractiveContext.mockReturnValue(false);

    await expect(runHandler()).rejects.toBeInstanceOf(CliUserError);
    expect(mocks.performOAuthLogin).not.toHaveBeenCalled();
    expect(mocks.performDeviceLogin).not.toHaveBeenCalled();
  });

  it("with --non-interactive, bypasses the TTY guard and runs headlessly via the loopback flow", async () => {
    mocks.isInteractiveContext.mockReturnValue(false);

    await runHandler({ nonInteractive: true });

    expect(mocks.performOAuthLogin).toHaveBeenCalledWith({
      openBrowserAutomatically: false,
    });
    expect(mocks.performDeviceLogin).not.toHaveBeenCalled();
    expect(mocks.selectProjectOnLogin).toHaveBeenCalledWith(
      expect.objectContaining({ interactive: false }),
    );
  });

  it("with --non-interactive on a real TTY, still prints the URL via the loopback flow and skips the picker", async () => {
    mocks.isInteractiveContext.mockReturnValue(true);

    await runHandler({ nonInteractive: true });

    expect(mocks.performOAuthLogin).toHaveBeenCalledWith({
      openBrowserAutomatically: false,
    });
    expect(mocks.performDeviceLogin).not.toHaveBeenCalled();
    expect(mocks.selectProjectOnLogin).toHaveBeenCalledWith(
      expect.objectContaining({ interactive: false }),
    );
  });

  it("with --device on a TTY, uses the device flow but keeps the interactive picker", async () => {
    mocks.isInteractiveContext.mockReturnValue(true);

    await runHandler({ device: true });

    expect(mocks.performDeviceLogin).toHaveBeenCalledWith();
    expect(mocks.performOAuthLogin).not.toHaveBeenCalled();
    expect(mocks.selectProjectOnLogin).toHaveBeenCalledWith(
      expect.objectContaining({ interactive: true }),
    );
  });

  it("with --device and no TTY, bypasses the guard and uses the device flow", async () => {
    mocks.isInteractiveContext.mockReturnValue(false);

    await runHandler({ device: true });

    expect(mocks.performDeviceLogin).toHaveBeenCalledWith();
    expect(mocks.performOAuthLogin).not.toHaveBeenCalled();
    expect(mocks.selectProjectOnLogin).toHaveBeenCalledWith(
      expect.objectContaining({ interactive: false }),
    );
  });

  it("propagates the error and skips the hint when no project could be selected", async () => {
    mocks.isInteractiveContext.mockReturnValue(false);
    mocks.selectProjectOnLogin.mockRejectedValue(
      new CliUserError("no project selected", 1, "warn"),
    );

    await expect(runHandler({ nonInteractive: true })).rejects.toBeInstanceOf(
      CliUserError,
    );
    expect(mocks.logNotice).not.toHaveBeenCalledWith(
      expect.stringContaining("auth set-project"),
    );
  });

  it("shows the change-project hint when selection succeeds", async () => {
    mocks.isInteractiveContext.mockReturnValue(true);

    await runHandler();

    expect(mocks.logNotice).toHaveBeenCalledWith(
      expect.stringContaining("auth set-project"),
    );
  });

  it("with no flags on a TTY, logs in via the loopback flow, then builds a client from the fresh token and selects a project", async () => {
    mocks.isInteractiveContext.mockReturnValue(true);

    await runHandler();

    expect(mocks.performOAuthLogin).toHaveBeenCalledWith({
      openBrowserAutomatically: true,
    });
    expect(mocks.performDeviceLogin).not.toHaveBeenCalled();
    expect(mocks.createClient).toHaveBeenCalledWith({ apiToken: "fresh-jwt" });
    expect(mocks.selectProjectOnLogin).toHaveBeenCalledWith(
      expect.objectContaining({ project: undefined, interactive: true }),
    );
  });

  it("preserves the existing session when the browser login fails", async () => {
    mocks.isInteractiveContext.mockReturnValue(true);
    mocks.performOAuthLogin.mockRejectedValue(new Error("login cancelled"));

    await expect(runHandler()).rejects.toThrow("login cancelled");
    expect(mocks.selectProjectOnLogin).not.toHaveBeenCalled();
  });

  it("passes an explicit --project through to selection", async () => {
    mocks.isInteractiveContext.mockReturnValue(true);

    await runHandler({ project: "Org/App" });

    expect(mocks.selectProjectOnLogin).toHaveBeenCalledWith(
      expect.objectContaining({ project: "Org/App" }),
    );
  });
});
