import { beforeEach, describe, expect, it, vi } from "vitest";
import { CliUserError } from "../../../utils/cli-user-error";
import { exchangeOidcCommand } from "../exchange-oidc.command";

vi.mock("../../../command-utils/sentry.utils", () => ({
  wrapHandler: (fn: (...args: unknown[]) => Promise<void>) => fn,
}));

const mocks = vi.hoisted(() => ({
  resolveCiOidcAccessToken: vi.fn(),
  isFetchError: vi.fn(),
  routeLogsToStderr: vi.fn(),
  initLogger: vi.fn(),
}));

vi.mock("@alwaysmeticulous/common", () => ({
  initLogger: mocks.initLogger,
  routeLogsToStderr: mocks.routeLogsToStderr,
}));

vi.mock("@alwaysmeticulous/client", () => ({
  CI_OIDC_DEFAULT_AUDIENCE: "https://app.meticulous.ai",
  resolveCiOidcAccessToken: mocks.resolveCiOidcAccessToken,
  isFetchError: mocks.isFetchError,
}));

const runHandler = (
  args: {
    project?: string;
    oidcToken?: string;
    audience?: string;
    json?: boolean;
  } = {},
) =>
  (
    exchangeOidcCommand as { handler: (args: unknown) => Promise<void> }
  ).handler({
    json: false,
    ...args,
  });

describe("exchange-oidc command", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isFetchError.mockReturnValue(false);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("routes logs to stderr and prints only the bare access token to stdout", async () => {
    mocks.resolveCiOidcAccessToken.mockResolvedValue({
      accessToken: "wfat-ci-token",
      expiresAt: "2026-11-27T13:00:00.000Z",
    });

    await runHandler({
      project: "acme/web",
      oidcToken: "eyJ.oidc",
      audience: "https://custom.aud",
    });

    expect(mocks.routeLogsToStderr).toHaveBeenCalledTimes(1);
    expect(mocks.resolveCiOidcAccessToken).toHaveBeenCalledWith({
      project: "acme/web",
      oidcToken: "eyJ.oidc",
      audience: "https://custom.aud",
    });
    expect(logSpy.mock.calls.flat().join("\n")).toBe("wfat-ci-token");
  });

  it("prints accessToken and expiresAt as JSON when --json is set", async () => {
    mocks.resolveCiOidcAccessToken.mockResolvedValue({
      accessToken: "wfat-ci-token",
      expiresAt: "2026-11-27T13:00:00.000Z",
    });

    await runHandler({ json: true });

    expect(JSON.parse(logSpy.mock.calls.flat().join("\n"))).toEqual({
      accessToken: "wfat-ci-token",
      expiresAt: "2026-11-27T13:00:00.000Z",
    });
  });

  it("converts a 403 backend rejection into a CliUserError with the server message", async () => {
    mocks.isFetchError.mockReturnValue(true);
    mocks.resolveCiOidcAccessToken.mockRejectedValue({
      response: {
        status: 403,
        data: {
          message:
            'The OIDC token was rejected: the token\'s "ref" claim does not satisfy the trust policy.',
        },
      },
    });

    await expect(runHandler()).rejects.toThrow(
      /the token's "ref" claim does not satisfy the trust policy/,
    );
    await expect(runHandler()).rejects.toBeInstanceOf(CliUserError);
  });

  it("rethrows 5xx fetch errors unchanged rather than swallowing server defects as user errors", async () => {
    const serverError = {
      response: {
        status: 503,
        data: { message: "Could not fetch signing keys" },
      },
    };
    mocks.isFetchError.mockReturnValue(true);
    mocks.resolveCiOidcAccessToken.mockRejectedValue(serverError);

    await expect(runHandler()).rejects.toBe(serverError);
  });
});
