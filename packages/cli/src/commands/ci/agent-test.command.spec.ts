import { access, readFile } from "fs/promises";
import { join } from "path";
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
  resolveUploadSource: vi.fn(
    ({ uploadSource }: { uploadSource: boolean | undefined }) =>
      Promise.resolve(uploadSource ?? false),
  ),
  resolveCheckedOutCommit: vi.fn(() => Promise.resolve("a".repeat(40))),
}));

vi.mock("./agent-test-source.utils", () => ({
  resolveUploadSource: mocks.resolveUploadSource,
  resolveCheckedOutCommit: mocks.resolveCheckedOutCommit,
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

describe("ci agent-test on a project without a hosting provider", () => {
  const BASE_SHA = "b".repeat(40);
  const HEAD_SHA = "a".repeat(40);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reuses an uploaded deployment, reads the source from --repoDirectory at --commitSha, and uploads it by default", async () => {
    mocks.resolveUploadSource.mockResolvedValueOnce(true);

    await runHandler({
      deploymentId: "deployment1",
      commitSha: HEAD_SHA,
      repoDirectory: "/work/head",
      baseSha: BASE_SHA,
      headTestRunId: "testrun1",
      enableLocalMocks: true,
    });

    expect(mocks.resolveCheckedOutCommit).toHaveBeenCalledWith({
      repoDirectory: "/work/head",
      commitSha: HEAD_SHA,
    });
    expect(mocks.resolveGitOptions).not.toHaveBeenCalled();
    expect(mocks.generateSessions).toHaveBeenCalledWith(
      expect.objectContaining({
        deploymentId: "deployment1",
        commitSha: HEAD_SHA,
        sourceSnapshot: { repoDirectory: "/work/head", baseSha: BASE_SHA },
        headTestRunId: "testrun1",
        enableLocalMocks: true,
      }),
    );
  });

  it("does not upload source for a project with a hosting provider", async () => {
    await runHandler({ assetsDir: "dist" });

    expect(mocks.generateSessions).toHaveBeenCalledWith(
      expect.not.objectContaining({ sourceSnapshot: expect.anything() }),
    );
  });

  it("asks for --baseSha when it must upload the source", async () => {
    mocks.resolveUploadSource.mockResolvedValueOnce(true);

    await expect(
      runHandler({
        assetsDir: "dist",
        commitSha: HEAD_SHA,
        repoDirectory: "/work/head",
      }),
    ).rejects.toThrow("--baseSha");
    expect(mocks.generateSessions).not.toHaveBeenCalled();
  });

  it("refuses more than one build", async () => {
    await expect(
      runHandler({ assetsDir: "dist", deploymentId: "deployment1" }),
    ).rejects.toThrow("exactly one of");
  });

  it("prints the swarm run id on a stable line", async () => {
    mocks.generateSessions.mockResolvedValueOnce({
      uploadId: "upload",
      agenticRunId: "swarmrun1",
    } as never);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await runHandler({ assetsDir: "dist" });

    expect(log).toHaveBeenCalledWith("Agent swarm run: swarmrun1");
    log.mockRestore();
  });

  it("passes an explicit base preview pair through", async () => {
    await runHandler({
      previewUrl: "https://head.example.com",
      basePreviewUrl: "https://base.example.com",
      baseSha: "b".repeat(40),
    });
    expect(mocks.generateSessions).toHaveBeenCalledWith(
      expect.objectContaining({
        previewUrl: "https://head.example.com",
        basePreviewUrl: "https://base.example.com",
        baseSha: "b".repeat(40),
      }),
    );
  });

  it("rejects --basePreviewUrl without --previewUrl or --baseSha", async () => {
    await expect(
      runHandler({
        assetsDir: "dist",
        basePreviewUrl: "https://base.example.com",
        baseSha: "b".repeat(40),
      }),
    ).rejects.toThrow(/requires --previewUrl and --baseSha/);
    await expect(
      runHandler({
        previewUrl: "https://head.example.com",
        basePreviewUrl: "https://base.example.com",
      }),
    ).rejects.toThrow(/requires --previewUrl and --baseSha/);
  });

  it("rejects upload-time container flags with --deploymentId", async () => {
    await expect(
      runHandler({ deploymentId: "deployment1", appPort: 8080 }),
    ).rejects.toThrow(/reuses an uploaded build as it was uploaded/);
    await expect(
      runHandler({
        deploymentId: "deployment1",
        containerHealthCheckEndpoint: "/health",
      }),
    ).rejects.toThrow(/reuses an uploaded build as it was uploaded/);
  });

  it("prints the result as JSON with --json", async () => {
    mocks.generateSessions.mockResolvedValueOnce({
      agenticRunId: "swarmrun1",
    } as never);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await runHandler({ deploymentId: "deployment1", json: true });

    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toEqual({
      swarmRunId: "swarmrun1",
      commitSha: "abc123",
      deploymentId: "deployment1",
    });
    log.mockRestore();
  });
});

describe("ci agent-test URL", () => {
  it("passes one URL through to the launch", async () => {
    await runHandler({ previewUrl: "https://head.example.com" });
    expect(mocks.generateSessions).toHaveBeenCalledWith(
      expect.objectContaining({ previewUrl: "https://head.example.com" }),
    );
  });
  it("echoes the URL in the --json result", async () => {
    mocks.generateSessions.mockResolvedValueOnce({
      agenticRunId: "swarmrun1",
    } as never);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await runHandler({ previewUrl: "https://head.example.com", json: true });

    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toEqual({
      swarmRunId: "swarmrun1",
      commitSha: "abc123",
      previewUrl: "https://head.example.com",
    });
    log.mockRestore();
  });
  it("rejects URL mixed with uploads or backend config", async () => {
    await expect(
      runHandler({ previewUrl: "https://head.example.com", assetsDir: "dist" }),
    ).rejects.toThrow();
    await expect(
      runHandler({
        previewUrl: "https://head.example.com",
        backendUrl: "https://api.example.com",
      }),
    ).rejects.toThrow();
  });
});

it("parses --previewUrl for a single preview launch", async () => {
  const parsed = await parseAgentTest([
    "--previewUrl",
    "https://preview.example.com",
  ]);
  expect(parsed?.previewUrl).toBe("https://preview.example.com");
  await runHandler(parsed!);
  expect(mocks.generateSessions).toHaveBeenCalledWith(
    expect.objectContaining({ previewUrl: "https://preview.example.com" }),
  );
});

describe("ci agent-test --egressRule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses and forwards repeated launch egress rules", async () => {
    await runHandler({
      assetsDir: "dist",
      egressRule: [
        "allow:js.stripe.com,fonts.googleapis.com:443,8443",
        "deny:10.0.0.0/8",
      ],
    });

    expect(mocks.generateSessions).toHaveBeenCalledWith(
      expect.objectContaining({
        egressRules: [
          {
            type: "allow",
            domains: ["js.stripe.com", "fonts.googleapis.com"],
            ports: [443, 8443],
          },
          { type: "deny", ipRanges: ["10.0.0.0/8"] },
        ],
      }),
    );
  });

  it("rejects an invalid action before launching", async () => {
    await expect(
      runHandler({ assetsDir: "dist", egressRule: ["maybe:example.com"] }),
    ).rejects.toThrow("action must be allow or deny");
    expect(mocks.generateSessions).not.toHaveBeenCalled();
  });
});

describe("ci agent-test --hostRewriteRegex", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses and forwards the launch override", async () => {
    const parsed = await parseAgentTest([
      "--assetsDir",
      "dist",
      "--hostRewriteRegex",
      "(^|\\.)example\\.com$",
    ]);
    expect(parsed?.["hostRewriteRegex"]).toBe("(^|\\.)example\\.com$");

    await runHandler(parsed!);
    expect(mocks.generateSessions).toHaveBeenCalledWith(
      expect.objectContaining({
        hostRewriteRegex: "(^|\\.)example\\.com$",
      }),
    );
  });

  it("forwards an empty override to disable the saved rewrite", async () => {
    await runHandler({ assetsDir: "dist", hostRewriteRegex: "" });
    expect(mocks.generateSessions).toHaveBeenCalledWith(
      expect.objectContaining({ hostRewriteRegex: "" }),
    );
  });

  it("rejects an invalid regex before launching", async () => {
    await expect(
      runHandler({ assetsDir: "dist", hostRewriteRegex: "[" }),
    ).rejects.toThrow("Invalid --hostRewriteRegex");
    expect(mocks.generateSessions).not.toHaveBeenCalled();
  });
});

describe("ci agent-test --previewUrlAgentSwarm", () => {
  const PREVIEW = "https://pr-12.preview.example.com";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("launches against the live preview with a placeholder build, proxying every path", async () => {
    let placeholderIndex: string | undefined;
    mocks.generateSessions.mockImplementationOnce((async ({
      assetsDirectory,
    }: {
      assetsDirectory: string;
    }) => {
      placeholderIndex = await readFile(
        join(assetsDirectory, "index.html"),
        "utf8",
      );
      return { agenticRunId: "swarmrun1", swarmKind: "preview-url" };
    }) as never);
    const parsed = await parseAgentTest([
      "--previewUrlAgentSwarm",
      "--backendUrl",
      PREVIEW,
    ]);

    await runHandler(parsed!);

    expect(mocks.generateSessions).toHaveBeenCalledWith(
      expect.objectContaining({
        swarmKind: "preview-url",
        assetsDirectory: expect.any(String),
        backend: expect.objectContaining({ url: PREVIEW, proxyPaths: ["/"] }),
      }),
    );
    expect(placeholderIndex).toBe("<!doctype html>\n");
    const [{ assetsDirectory }] = mocks.generateSessions.mock
      .calls[0] as unknown as [{ assetsDirectory: string }];
    await expect(access(assetsDirectory)).rejects.toThrow();
    expect(loggerMock.warn).not.toHaveBeenCalled();
  });

  it("uploads the given --assetsDir instead of a placeholder", async () => {
    await runHandler({
      previewUrlAgentSwarm: true,
      assetsDir: "dist",
      backendUrl: PREVIEW,
      backendProxyPaths: ["/"],
    });

    expect(mocks.generateSessions).toHaveBeenCalledWith(
      expect.objectContaining({
        swarmKind: "preview-url",
        assetsDirectory: "dist",
      }),
    );
  });

  it.each([
    ["without --backendUrl", {}, /needs --backendUrl/],
    [
      "with --previewUrl",
      { backendUrl: PREVIEW, previewUrl: PREVIEW },
      /can't be combined/,
    ],
    [
      "with --localImageTag",
      { backendUrl: PREVIEW, localImageTag: "app:latest" },
      /can't be combined/,
    ],
    [
      "with proxy paths that leave the uploaded build serving pages",
      { backendUrl: PREVIEW, backendProxyPaths: ["/api"] },
      /serve every path/,
    ],
  ])("refuses a launch %s", async (_name, options, error) => {
    await expect(
      runHandler({ previewUrlAgentSwarm: true, ...options }),
    ).rejects.toThrow(error);
    expect(mocks.generateSessions).not.toHaveBeenCalled();
  });

  it("warns when the backend launched a regular run instead, and prints the kind it reported", async () => {
    mocks.generateSessions.mockResolvedValueOnce({
      agenticRunId: "swarmrun1",
    } as never);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await runHandler({
      previewUrlAgentSwarm: true,
      backendUrl: PREVIEW,
      json: true,
    });

    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.stringContaining("launched a regular Agent swarm run"),
    );
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toEqual({
      swarmRunId: "swarmrun1",
      commitSha: "abc123",
    });
    log.mockRestore();
  });
});
