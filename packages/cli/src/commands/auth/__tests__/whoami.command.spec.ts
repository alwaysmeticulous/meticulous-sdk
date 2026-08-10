import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { whoamiCommand } from "../whoami.command";

// Make wrapHandler a passthrough so handler errors propagate directly to tests
// rather than being swallowed by process.exit().
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
  createClientWithOAuth: vi.fn(),
  getAgentWhoami: vi.fn(),
  logNotice: vi.fn(),
}));

vi.mock("@alwaysmeticulous/common", () => ({
  initLogger: () => loggerMock,
  logNotice: mocks.logNotice,
}));

vi.mock("@alwaysmeticulous/client", () => ({
  getAuthToken: mocks.getAuthToken,
  createClientWithOAuth: mocks.createClientWithOAuth,
  getAgentWhoami: mocks.getAgentWhoami,
}));

vi.mock("../../../utils/handle-auth-failure", () => ({
  handleAuthFailure: vi.fn().mockReturnValue(false),
  toServerMessageError: (error: unknown) => error,
}));

const runHandler = (args: { json?: boolean } = {}) =>
  (whoamiCommand as { handler: (args: unknown) => Promise<void> }).handler({
    json: false,
    ...args,
  });

let logSpy: ReturnType<typeof vi.spyOn>;
const stdoutText = () => logSpy.mock.calls.flat().join("\n");
const noticeText = () => mocks.logNotice.mock.calls.flat().join("\n");

const OAUTH_WHOAMI = {
  authenticatedVia: "oauth" as const,
  email: "alice@example.com",
  firstName: "Alice",
  lastName: "Smith",
  isAdmin: false,
  organizations: [],
  selectedProject: null,
};

const TOKEN_WHOAMI = {
  authenticatedVia: "project-api-token" as const,
  selectedProject: "Org/App",
};

describe("whoami command", () => {
  const originalEnvToken = process.env["METICULOUS_API_TOKEN"];

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env["METICULOUS_API_TOKEN"];
    mocks.createClientWithOAuth.mockResolvedValue({});
    mocks.getAgentWhoami.mockResolvedValue(OAUTH_WHOAMI);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  afterAll(() => {
    if (originalEnvToken === undefined) {
      delete process.env["METICULOUS_API_TOKEN"];
    } else {
      process.env["METICULOUS_API_TOKEN"] = originalEnvToken;
    }
  });

  describe("OAuth token", () => {
    beforeEach(() => {
      mocks.getAuthToken.mockResolvedValue("oauth-jwt");
    });

    it("reports the OAuth user", async () => {
      await runHandler();

      const out = stdoutText();
      expect(out).toContain("Authenticated via: OAuth");
      expect(out).toContain("alice@example.com");
      expect(out).toContain("Alice Smith");
    });

    it("prints organizations with their role", async () => {
      mocks.getAgentWhoami.mockResolvedValue({
        ...OAUTH_WHOAMI,
        organizations: [{ name: "Acme", role: "owner" }],
      });

      await runHandler();

      expect(stdoutText()).toContain("Acme (owner)");
    });

    it("prints the selected project when one is stored", async () => {
      mocks.getAgentWhoami.mockResolvedValue({
        ...OAUTH_WHOAMI,
        selectedProject: "Acme/my-project",
      });

      await runHandler();

      expect(stdoutText()).toContain("Acme/my-project");
    });

    it("prompts (on stderr) to set a project when none is selected", async () => {
      await runHandler();

      expect(noticeText()).toContain("auth set-project");
    });

    it("emits structured JSON with --json", async () => {
      mocks.getAgentWhoami.mockResolvedValue({
        ...OAUTH_WHOAMI,
        organizations: [{ name: "Acme", role: "owner" }],
        selectedProject: "Acme/my-project",
      });

      await runHandler({ json: true });

      expect(JSON.parse(stdoutText())).toEqual({
        authenticatedVia: "oauth",
        email: "alice@example.com",
        firstName: "Alice",
        lastName: "Smith",
        isAdmin: false,
        organizations: [{ name: "Acme", role: "owner" }],
        selectedProject: "Acme/my-project",
      });
    });
  });

  describe("project API token", () => {
    beforeEach(() => {
      mocks.getAuthToken.mockResolvedValue("project-token");
      mocks.getAgentWhoami.mockResolvedValue(TOKEN_WHOAMI);
    });

    it("reports the env var as the source", async () => {
      process.env["METICULOUS_API_TOKEN"] = "project-token";

      await runHandler();

      expect(stdoutText()).toContain(
        "project API token (METICULOUS_API_TOKEN environment variable)",
      );
    });

    // Which local file or env var supplied the token is knowable only in the
    // CLI — the backend sees a bearer, not where it came from.
    it("reports the config file as the source when the env var is unset", async () => {
      await runHandler();

      expect(stdoutText()).toContain(
        "project API token (~/.meticulous/config.json)",
      );
    });

    it("shows the project the token is pinned to", async () => {
      await runHandler();

      expect(stdoutText()).toContain("Pinned project: Org/App");
      expect(noticeText()).toContain("scoped to a single project");
    });

    it("emits structured JSON with --json", async () => {
      await runHandler({ json: true });

      expect(JSON.parse(stdoutText())).toEqual({
        authenticatedVia: "project-api-token",
        tokenSource: "~/.meticulous/config.json",
        selectedProject: "Org/App",
        pinnedProject: "Org/App",
      });
    });
  });

  describe("no local token (request-time injected auth)", () => {
    beforeEach(() => {
      mocks.getAuthToken.mockResolvedValue(null);
    });

    it("reports injected credentials when the header-less call is answered", async () => {
      mocks.getAgentWhoami.mockResolvedValue(TOKEN_WHOAMI);

      await runHandler();

      const out = stdoutText();
      expect(out).toContain("credentials injected at request time");
      expect(out).toContain("Pinned project: Org/App");
    });

    it("emits structured JSON with --json", async () => {
      mocks.getAgentWhoami.mockResolvedValue(TOKEN_WHOAMI);

      await runHandler({ json: true });

      expect(JSON.parse(stdoutText())).toEqual({
        authenticatedVia: "injected-credentials",
        selectedProject: "Org/App",
        pinnedProject: "Org/App",
      });
    });

    it("errors with not-logged-in guidance when nothing is injected", async () => {
      mocks.getAgentWhoami.mockRejectedValue(new Error("HTTP 401"));

      await expect(runHandler()).rejects.toThrow(/Not logged in/);
    });

    it("prints nothing to stdout before throwing not-logged-in with --json", async () => {
      mocks.getAgentWhoami.mockRejectedValue(new Error("HTTP 401"));

      await expect(runHandler({ json: true })).rejects.toThrow(/Not logged in/);
      expect(stdoutText()).toBe("");
    });

    it("omits the Pinned project line when the injected credentials have no selected project", async () => {
      mocks.getAgentWhoami.mockResolvedValue({
        ...TOKEN_WHOAMI,
        selectedProject: null,
      });

      await runHandler();

      expect(stdoutText()).not.toContain("Pinned project");
    });
  });

  describe("test-run API token", () => {
    beforeEach(() => {
      mocks.getAuthToken.mockResolvedValue("test-run-token");
      mocks.getAgentWhoami.mockResolvedValue({
        authenticatedVia: "test-run-token" as const,
        selectedProject: "Org/App",
      });
    });

    it("reports itself distinctly from a project API token", async () => {
      await runHandler();

      const out = stdoutText();
      expect(out).toContain("test-run API token");
      expect(out).toContain("Pinned project: Org/App");
      expect(noticeText()).toContain("scoped to a single project");
    });

    it("emits structured JSON with --json", async () => {
      await runHandler({ json: true });

      expect(JSON.parse(stdoutText())).toEqual({
        authenticatedVia: "test-run-token",
        tokenSource: "~/.meticulous/config.json",
        selectedProject: "Org/App",
        pinnedProject: "Org/App",
      });
    });
  });
});
