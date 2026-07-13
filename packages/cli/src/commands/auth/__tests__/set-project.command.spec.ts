import { beforeEach, describe, expect, it, vi } from "vitest";
import { CliUserError } from "../../../utils/cli-user-error";
import { setProjectCommand } from "../set-project.command";

vi.mock("../../../command-utils/sentry.utils", () => ({
  wrapHandler: (fn: (...args: unknown[]) => Promise<void>) => fn,
}));

const mocks = vi.hoisted(() => ({
  resolveApiTokenWithOAuth: vi.fn(),
  createClientWithOAuth: vi.fn(),
  isInteractiveContext: vi.fn(),
  isOAuthJwt: vi.fn(),
  selectAndStoreProject: vi.fn(),
}));

vi.mock("@alwaysmeticulous/common", () => ({
  initLogger: vi.fn(),
}));

vi.mock("@alwaysmeticulous/client", () => ({
  createClientWithOAuth: mocks.createClientWithOAuth,
  isInteractiveContext: mocks.isInteractiveContext,
  isOAuthJwt: mocks.isOAuthJwt,
  resolveApiTokenWithOAuth: mocks.resolveApiTokenWithOAuth,
}));

vi.mock("../../../utils/select-project", () => ({
  selectAndStoreProject: mocks.selectAndStoreProject,
}));

const runHandler = (args: { project?: string } = {}) =>
  (setProjectCommand as { handler: (args: unknown) => Promise<void> }).handler(
    args,
  );

describe("set-project command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveApiTokenWithOAuth.mockResolvedValue("oauth-jwt");
    mocks.createClientWithOAuth.mockResolvedValue({});
    mocks.isInteractiveContext.mockReturnValue(true);
    mocks.isOAuthJwt.mockReturnValue(true);
    mocks.selectAndStoreProject.mockResolvedValue("Org/App");
  });

  it("selects a project for an OAuth caller", async () => {
    await runHandler({ project: "Org/App" });

    expect(mocks.selectAndStoreProject).toHaveBeenCalledWith(
      expect.objectContaining({
        project: "Org/App",
        allowInteractivePrompt: true,
      }),
    );
  });

  it("rejects a project-scoped API token", async () => {
    mocks.isOAuthJwt.mockReturnValue(false);

    await expect(runHandler()).rejects.toBeInstanceOf(CliUserError);
    expect(mocks.selectAndStoreProject).not.toHaveBeenCalled();
    expect(mocks.createClientWithOAuth).not.toHaveBeenCalled();
  });

  it("passes allowInteractivePrompt from the current TTY state", async () => {
    mocks.isInteractiveContext.mockReturnValue(false);

    await runHandler();

    expect(mocks.selectAndStoreProject).toHaveBeenCalledWith(
      expect.objectContaining({ allowInteractivePrompt: false }),
    );
  });
});
