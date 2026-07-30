import { beforeEach, describe, expect, it, vi } from "vitest";
import { CliUserError } from "../../../utils/cli-user-error";
import { getProjectCommand } from "../get-project.command";

vi.mock("../../../command-utils/sentry.utils", () => ({
  wrapHandler: (fn: (...args: unknown[]) => Promise<void>) => fn,
}));

const mocks = vi.hoisted(() => ({
  resolveApiTokenWithOAuth: vi.fn(),
  createClientWithOAuth: vi.fn(),
  isOAuthJwt: vi.fn(),
  getOAuthDefaultProject: vi.fn(),
  createClient: vi.fn(),
  getProject: vi.fn(),
}));

vi.mock("@alwaysmeticulous/common", () => ({
  initLogger: vi.fn(),
}));

vi.mock("@alwaysmeticulous/client", () => ({
  createClientWithOAuth: mocks.createClientWithOAuth,
  isOAuthJwt: mocks.isOAuthJwt,
  resolveApiTokenWithOAuth: mocks.resolveApiTokenWithOAuth,
  getOAuthDefaultProject: mocks.getOAuthDefaultProject,
  createClient: mocks.createClient,
  getProject: mocks.getProject,
}));

const runHandler = () =>
  (getProjectCommand as { handler: (args: unknown) => Promise<void> }).handler(
    {},
  );

let logSpy: ReturnType<typeof vi.spyOn>;
const stdoutText = () => logSpy.mock.calls.flat().join("\n");

describe("get-project command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveApiTokenWithOAuth.mockResolvedValue("oauth-jwt");
    mocks.createClientWithOAuth.mockResolvedValue({});
    mocks.createClient.mockReturnValue({});
    mocks.isOAuthJwt.mockReturnValue(true);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("prints the default project for an OAuth caller", async () => {
    mocks.getOAuthDefaultProject.mockResolvedValue({
      projectId: "proj-1",
      name: "App",
      organization: { id: "org-1", name: "Org" },
    });

    await runHandler();

    expect(stdoutText()).toBe("Org/App");
  });

  it("throws when no default project is set for an OAuth caller", async () => {
    mocks.getOAuthDefaultProject.mockResolvedValue({ projectId: null });

    await expect(runHandler()).rejects.toBeInstanceOf(CliUserError);
  });

  it("prints the pinned project for a project-scoped API token", async () => {
    mocks.isOAuthJwt.mockReturnValue(false);
    mocks.getProject.mockResolvedValue({
      name: "App",
      organization: { name: "Org" },
    });

    await runHandler();

    expect(stdoutText()).toBe("Org/App");
    expect(mocks.getOAuthDefaultProject).not.toHaveBeenCalled();
  });

  it("throws when a project-scoped token's project can't be resolved", async () => {
    mocks.isOAuthJwt.mockReturnValue(false);
    mocks.getProject.mockResolvedValue(null);

    await expect(runHandler()).rejects.toThrow(
      "Could not resolve the project this API token is bound to.",
    );
  });

  it("falls through to the OAuth path when there is no local token", async () => {
    mocks.resolveApiTokenWithOAuth.mockResolvedValue(null);
    mocks.getOAuthDefaultProject.mockResolvedValue({ projectId: null });

    await expect(runHandler()).rejects.toThrow(/No default project set/);
    expect(mocks.getProject).not.toHaveBeenCalled();
  });
});
