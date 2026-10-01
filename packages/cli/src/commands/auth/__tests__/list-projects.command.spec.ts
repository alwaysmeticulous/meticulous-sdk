import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CliUserError } from "../../../utils/cli-user-error";
import { listProjectsCommand } from "../list-projects.command";

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
  getAuthToken: vi.fn(),
  isInteractiveContext: vi.fn(),
  performOAuthLogin: vi.fn(),
  createClient: vi.fn(),
  listProjectsForUser: vi.fn(),
  logNotice: vi.fn(),
}));

vi.mock("@alwaysmeticulous/common", () => ({
  initLogger: () => loggerMock,
  logNotice: mocks.logNotice,
}));

vi.mock("@alwaysmeticulous/client", () => ({
  getAuthToken: mocks.getAuthToken,
  isInteractiveContext: mocks.isInteractiveContext,
  performOAuthLogin: mocks.performOAuthLogin,
  createClient: mocks.createClient,
}));

vi.mock("../../../utils/select-project", () => ({
  listProjectsForUser: mocks.listProjectsForUser,
}));

const runHandler = (args: { apiToken?: string; json?: boolean } = {}) =>
  (
    listProjectsCommand as { handler: (args: unknown) => Promise<void> }
  ).handler(args);

// Matches the backend's list shape, which the command passes through verbatim.
const project = (org: string, name: string, id: string) => ({
  id,
  name,
  organization: { name: org },
});

describe("list-projects command", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockReturnValue({});
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  const stdoutText = () => logSpy.mock.calls.flat().join("\n");

  describe("with a stored OAuth login", () => {
    beforeEach(() => {
      mocks.getAuthToken.mockResolvedValue("oauth-jwt");
    });

    it("writes one slug per line", async () => {
      mocks.listProjectsForUser.mockResolvedValue([
        project("OrgA", "App1", "id-1"),
        project("OrgB", "App2", "id-2"),
      ]);

      await runHandler();

      expect(mocks.performOAuthLogin).not.toHaveBeenCalled();
      expect(stdoutText()).toBe("OrgA/App1\nOrgB/App2");
    });

    it("writes a JSON array with --json", async () => {
      mocks.listProjectsForUser.mockResolvedValue([
        project("OrgA", "App1", "id-1"),
      ]);

      await runHandler({ json: true });

      const payload = JSON.parse(stdoutText());
      expect(payload).toEqual([
        { id: "id-1", name: "App1", organization: { name: "OrgA" } },
      ]);
    });

    it("reports an empty account on stderr (human mode) and writes no slugs", async () => {
      mocks.listProjectsForUser.mockResolvedValue([]);

      await runHandler();

      expect(stdoutText()).toBe("");
      expect(mocks.logNotice.mock.calls.flat().join("\n")).toContain(
        "No projects are accessible",
      );
    });

    it("writes an empty JSON array (not a message) on stdout with --json when there are none", async () => {
      mocks.listProjectsForUser.mockResolvedValue([]);

      await runHandler({ json: true });

      // stdout stays valid, parseable JSON even with no result...
      expect(JSON.parse(stdoutText())).toEqual([]);
      // ...and the human notice goes to stderr, not stdout.
      expect(mocks.logNotice.mock.calls.flat().join("\n")).toContain(
        "No projects are accessible",
      );
    });
  });

  describe("with an API token", () => {
    it("lists the token's projects without an OAuth login", async () => {
      mocks.getAuthToken.mockResolvedValue("prat-token");
      mocks.listProjectsForUser.mockResolvedValue([
        project("OrgA", "App1", "id-1"),
        project("OrgA", "App2", "id-2"),
      ]);

      await runHandler({ apiToken: "prat-token" });

      expect(mocks.getAuthToken).toHaveBeenCalledWith("prat-token");
      expect(mocks.performOAuthLogin).not.toHaveBeenCalled();
      expect(mocks.createClient).toHaveBeenCalledWith({
        apiToken: "prat-token",
      });
      expect(stdoutText()).toBe("OrgA/App1\nOrgA/App2");
    });
  });

  describe("without any credentials", () => {
    beforeEach(() => {
      mocks.getAuthToken.mockResolvedValue(null);
    });

    it("throws a CliUserError in a non-interactive context", async () => {
      mocks.isInteractiveContext.mockReturnValue(false);

      await expect(runHandler()).rejects.toBeInstanceOf(CliUserError);
      expect(mocks.performOAuthLogin).not.toHaveBeenCalled();
    });

    it("performs a browser login when interactive, then lists", async () => {
      mocks.isInteractiveContext.mockReturnValue(true);
      mocks.performOAuthLogin.mockResolvedValue({ accessToken: "fresh-jwt" });
      mocks.listProjectsForUser.mockResolvedValue([
        project("OrgA", "App1", "id-1"),
      ]);

      await runHandler();

      expect(mocks.performOAuthLogin).toHaveBeenCalled();
      expect(mocks.createClient).toHaveBeenCalledWith({
        apiToken: "fresh-jwt",
      });
      expect(stdoutText()).toBe("OrgA/App1");
    });
  });
});
