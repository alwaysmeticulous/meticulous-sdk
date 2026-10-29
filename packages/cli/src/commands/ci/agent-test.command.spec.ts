import type * as Client from "@alwaysmeticulous/client";
import type * as Common from "@alwaysmeticulous/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import yargs from "yargs";
import { ciAgentTestCommand } from "./agent-test.command";

const loggerMock = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

const mocks = vi.hoisted(() => ({
  generateSessions: vi.fn(() => Promise.resolve({ uploadId: "upload" })),
  resolveGitOptions: vi.fn(() => Promise.resolve({ commitSha: "abc123" })),
  resolveApiTokenWithOAuth: vi.fn(() => Promise.resolve("token")),
  resolveProjectIdentifier: vi.fn(() =>
    Promise.resolve({ projectId: "project" }),
  ),
}));

vi.mock("../../command-utils/sentry.utils", () => ({
  wrapHandler: <T>(fn: (args: T) => Promise<void>) => fn,
}));

vi.mock("@alwaysmeticulous/common", async (importOriginal) => {
  const actual = await importOriginal<typeof Common>();
  return {
    ...actual,
    initLogger: () => loggerMock,
  };
});

vi.mock("@alwaysmeticulous/remote-replay-launcher", () => ({
  generateSessions: mocks.generateSessions,
}));

vi.mock("./resolve-git-options", () => ({
  resolveGitOptions: mocks.resolveGitOptions,
}));

vi.mock("@alwaysmeticulous/client", async (importOriginal) => {
  const actual = await importOriginal<typeof Client>();
  return {
    ...actual,
    resolveApiTokenWithOAuth: mocks.resolveApiTokenWithOAuth,
  };
});

vi.mock("../../utils/resolve-project-identifier", () => ({
  resolveProjectIdentifier: mocks.resolveProjectIdentifier,
}));

const parseAgentTest = async (args: string[]) => {
  let parsed: Record<string, unknown> | undefined;
  await yargs()
    .exitProcess(false)
    .command({
      ...ciAgentTestCommand,
      handler: (argv) => {
        parsed = argv as Record<string, unknown>;
      },
    })
    .parseAsync(["agent-test", ...args]);
  return parsed;
};

const runHandler = (args: Record<string, unknown>) =>
  (
    ciAgentTestCommand as {
      handler: (args: unknown) => Promise<void>;
    }
  ).handler(args);

describe("ci agent-test login options", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("collects METICULOUS_STAGING_* env vars into a camelCased loginOptions map", async () => {
    vi.stubEnv("METICULOUS_STAGING_USERNAME", "user@example.com");
    vi.stubEnv("METICULOUS_STAGING_PASSWORD", "password");
    vi.stubEnv("METICULOUS_STAGING_TOTP_SECRET", "TESTTOTPSECRET");
    vi.stubEnv("METICULOUS_STAGING_SKIP_EMAIL_CLIENT_ID", "trusted-client-id");

    await runHandler({
      assetsDir: "dist",
      backendUrl: "https://staging.example.com",
      backendProxyPaths: ["/api"],
    });

    expect(mocks.generateSessions).toHaveBeenCalledWith(
      expect.objectContaining({
        backend: {
          url: "https://staging.example.com",
          loginOptions: {
            username: "user@example.com",
            password: "password",
            totpSecret: "TESTTOTPSECRET",
            skipEmailClientId: "trusted-client-id",
          },
          proxyPaths: ["/api"],
        },
      }),
    );
  });

  it("omits empty env values and ignores non-staging vars", async () => {
    vi.stubEnv("METICULOUS_STAGING_USERNAME", "user@example.com");
    vi.stubEnv("METICULOUS_STAGING_TOTP_SECRET", "");
    vi.stubEnv("METICULOUS_API_TOKEN", "not-a-login-option");

    await runHandler({
      assetsDir: "dist",
      backendUrl: "https://staging.example.com",
      backendProxyPaths: ["/api"],
    });

    expect(mocks.generateSessions).toHaveBeenCalledWith(
      expect.objectContaining({
        backend: expect.objectContaining({
          loginOptions: { username: "user@example.com" },
        }),
      }),
    );
  });
});

describe("ci agent-test --appPort", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses --appPort as a number", async () => {
    const parsed = await parseAgentTest([
      "--assetsDir",
      "dist",
      "--appPort",
      "8001",
      "--dryRun",
    ]);

    expect(parsed?.["appPort"]).toBe(8001);
  });

  it("passes appPort through to generateSessions", async () => {
    await runHandler({
      assetsDir: "dist",
      appPort: 8001,
    });

    expect(mocks.generateSessions).toHaveBeenCalledTimes(1);
    expect(mocks.generateSessions).toHaveBeenCalledWith(
      expect.objectContaining({
        appPort: 8001,
      }),
    );
  });

  it("accepts --appPort for a fronted container", async () => {
    await runHandler({
      localImageTag: "app:latest",
      backendUrl: "https://staging.example.com",
      backendProxyPaths: ["/api"],
      appPort: 8123,
    });
    expect(mocks.generateSessions).toHaveBeenCalledWith(
      expect.objectContaining({ appPort: 8123 }),
    );
  });

  it("rejects --appPort with a non-proxying container", async () => {
    await expect(
      runHandler({
        localImageTag: "app:latest",
        appPort: 8001,
      }),
    ).rejects.toThrow(/requires --backendUrl and --backendProxyPaths/);

    expect(mocks.generateSessions).not.toHaveBeenCalled();
  });
});

describe("ci agent-test backend with a container", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("forwards the backend and env-var name on a container target", async () => {
    await runHandler({
      localImageTag: "myapp:sha",
      backendUrl: "https://staging.example.com",
      backendUrlEnvVariable: "API_ORIGIN",
    });

    expect(mocks.generateSessions).toHaveBeenCalledWith(
      expect.objectContaining({
        backend: expect.objectContaining({
          url: "https://staging.example.com",
        }),
        backendUrlEnvVariable: "API_ORIGIN",
      }),
    );
  });

  it("sends no proxy paths unless they were passed explicitly", async () => {
    await runHandler({
      localImageTag: "myapp:sha",
      backendUrl: "https://staging.example.com",
    });

    expect(mocks.generateSessions).toHaveBeenCalledWith(
      expect.objectContaining({
        backend: expect.objectContaining({ proxyPaths: [] }),
      }),
    );

    mocks.generateSessions.mockClear();
    await runHandler({
      localImageTag: "myapp:sha",
      backendUrl: "https://staging.example.com",
      backendProxyPaths: ["/api", "/graphql"],
    });

    expect(mocks.generateSessions).toHaveBeenCalledWith(
      expect.objectContaining({
        backend: expect.objectContaining({
          proxyPaths: ["/api", "/graphql"],
        }),
      }),
    );
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.stringContaining("experimental"),
    );
  });

  it("keeps the /api default for assets targets", async () => {
    await runHandler({
      assetsDir: "dist",
      backendUrl: "https://staging.example.com",
    });

    expect(mocks.generateSessions).toHaveBeenCalledWith(
      expect.objectContaining({
        backend: expect.objectContaining({ proxyPaths: ["/api"] }),
      }),
    );
    // The experimental warning is container-only.
    expect(loggerMock.warn).not.toHaveBeenCalled();
  });

  it("rejects --backendUrlEnvVariable with uploaded assets", async () => {
    await expect(
      runHandler({
        assetsDir: "dist",
        backendUrl: "https://staging.example.com",
        backendUrlEnvVariable: "API_ORIGIN",
      }),
    ).rejects.toThrow(
      "--backendUrlEnvVariable is only supported with --localImageTag.",
    );
  });

  it("still rejects --enableLocalMocks with --backendUrl", async () => {
    await expect(
      runHandler({
        localImageTag: "myapp:sha",
        backendUrl: "https://staging.example.com",
        enableLocalMocks: true,
      }),
    ).rejects.toThrow(
      "--enableLocalMocks cannot be combined with --backendUrl",
    );
  });
});
