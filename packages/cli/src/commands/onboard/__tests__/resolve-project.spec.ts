import type * as MeticulousClientModule from "@alwaysmeticulous/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CliUserError } from "../../../utils/cli-user-error";
import { ensureOnboardAuthenticated } from "../resolve-project";

const mocks = vi.hoisted(() => ({
  isInteractive: vi.fn(() => false),
  getAuthToken: vi.fn(),
  performOAuthLogin: vi.fn(),
}));

vi.mock("@alwaysmeticulous/client", async (importOriginal) => ({
  ...(await importOriginal<typeof MeticulousClientModule>()),
  CLI_LOGIN_INTENT_ONBOARD: "onboard",
  isInteractiveContext: () => mocks.isInteractive(),
  getAuthToken: mocks.getAuthToken,
  performOAuthLogin: mocks.performOAuthLogin,
}));

describe("ensureOnboardAuthenticated", () => {
  beforeEach(() => {
    mocks.isInteractive.mockReturnValue(false);
    mocks.getAuthToken.mockReset();
    mocks.performOAuthLogin.mockReset();
    mocks.getAuthToken.mockResolvedValue(null);
    mocks.performOAuthLogin.mockResolvedValue({ accessToken: "jwt" });
  });

  it("does nothing when a token is already present", async () => {
    mocks.getAuthToken.mockResolvedValue("existing-token");

    await ensureOnboardAuthenticated(undefined);

    expect(mocks.performOAuthLogin).not.toHaveBeenCalled();
  });

  it("errors in a non-interactive terminal instead of continuing unauthenticated", async () => {
    await expect(ensureOnboardAuthenticated(undefined)).rejects.toBeInstanceOf(
      CliUserError,
    );
    expect(mocks.performOAuthLogin).not.toHaveBeenCalled();
  });

  it("opens an onboard-tagged browser login when interactive and logged out", async () => {
    mocks.isInteractive.mockReturnValue(true);

    await ensureOnboardAuthenticated(undefined);

    expect(mocks.performOAuthLogin).toHaveBeenCalledWith({ intent: "onboard" });
  });
});
