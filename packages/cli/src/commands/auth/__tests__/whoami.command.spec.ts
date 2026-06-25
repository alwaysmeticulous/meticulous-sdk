import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
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

vi.mock("@alwaysmeticulous/common", () => ({
  initLogger: () => loggerMock,
}));

const mocks = vi.hoisted(() => ({
  resolveApiTokenWithOAuth: vi.fn(),
  isOAuthJwt: vi.fn(),
  createClient: vi.fn(),
  getWhoami: vi.fn(),
  getStoredProject: vi.fn(),
  getProject: vi.fn(),
}));

vi.mock("@alwaysmeticulous/client", () => ({
  resolveApiTokenWithOAuth: mocks.resolveApiTokenWithOAuth,
  isOAuthJwt: mocks.isOAuthJwt,
  createClient: mocks.createClient,
  getWhoami: mocks.getWhoami,
  getStoredProject: mocks.getStoredProject,
  getProject: mocks.getProject,
}));

vi.mock("../../../utils/handle-auth-failure", () => ({
  handleAuthFailure: vi.fn().mockReturnValue(false),
}));

const runHandler = () =>
  (whoamiCommand as { handler: (args: unknown) => Promise<void> }).handler({});

const loggedText = () => loggerMock.info.mock.calls.flat().join("\n");

const FAKE_WHOAMI = {
  email: "alice@example.com",
  firstName: "Alice",
  lastName: "Smith",
  isAdmin: false,
  organizations: [],
};

describe("whoami command", () => {
  const originalEnvToken = process.env["METICULOUS_API_TOKEN"];

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env["METICULOUS_API_TOKEN"];
    mocks.createClient.mockReturnValue({});
    mocks.getWhoami.mockResolvedValue(FAKE_WHOAMI);
    mocks.getStoredProject.mockReturnValue(null);
    mocks.getProject.mockResolvedValue(null);
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
      mocks.resolveApiTokenWithOAuth.mockResolvedValue("oauth-jwt");
      mocks.isOAuthJwt.mockReturnValue(true);
    });

    it("reports the OAuth user and skips the project-token path", async () => {
      await runHandler();

      expect(mocks.getWhoami).toHaveBeenCalled();
      expect(mocks.getProject).not.toHaveBeenCalled();
      const logged = loggedText();
      expect(logged).toContain("Authenticated via: OAuth");
      expect(logged).toContain("alice@example.com");
      expect(logged).toContain("Alice Smith");
    });

    it("logs organizations with their role", async () => {
      mocks.getWhoami.mockResolvedValue({
        ...FAKE_WHOAMI,
        organizations: [{ id: "org-1", name: "Acme", role: "owner" }],
      });

      await runHandler();

      expect(loggedText()).toContain("Acme (owner)");
    });

    it("logs the selected project when one is stored", async () => {
      mocks.getStoredProject.mockReturnValue("Acme/my-project");

      await runHandler();

      expect(loggedText()).toContain("Acme/my-project");
    });

    it("prompts to set a project when none is selected", async () => {
      mocks.getStoredProject.mockReturnValue(null);

      await runHandler();

      expect(loggedText()).toContain("auth set-project");
    });
  });

  describe("project API token", () => {
    beforeEach(() => {
      mocks.resolveApiTokenWithOAuth.mockResolvedValue("project-token");
      mocks.isOAuthJwt.mockReturnValue(false);
    });

    it("reports the env var as the source and never calls getWhoami", async () => {
      process.env["METICULOUS_API_TOKEN"] = "project-token";

      await runHandler();

      expect(mocks.getWhoami).not.toHaveBeenCalled();
      expect(loggedText()).toContain(
        "project API token (METICULOUS_API_TOKEN environment variable)",
      );
    });

    it("reports the config file as the source when the env var is unset", async () => {
      await runHandler();

      expect(loggedText()).toContain(
        "project API token (~/.meticulous/config.json)",
      );
    });

    it("shows the pinned project resolved via token-info", async () => {
      mocks.getProject.mockResolvedValue({
        id: "p1",
        name: "App",
        organization: { id: "o1", name: "Org" },
      });

      await runHandler();

      expect(loggedText()).toContain("Pinned project: Org/App");
    });

    it("swallows token-info failures without failing whoami", async () => {
      mocks.getProject.mockRejectedValue(new Error("boom"));

      await expect(runHandler()).resolves.toBeUndefined();
      expect(loggedText()).toContain("scoped to a single project");
    });
  });
});
