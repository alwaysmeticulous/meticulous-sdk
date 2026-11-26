import {
  completeAgenticSessionGeneration,
  createClient,
} from "@alwaysmeticulous/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateSessions } from "../generate-sessions";
import { uploadBuild } from "../upload-build";

const info = vi.hoisted(() => vi.fn());
vi.mock("@alwaysmeticulous/client", () => ({
  completeAgenticSessionGeneration: vi.fn(),
  createClient: vi.fn(),
  getApiToken: vi.fn((token) => token),
}));
vi.mock("@alwaysmeticulous/common", () => ({
  initLogger: () => ({
    debug: vi.fn(),
    info,
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));
vi.mock("@sentry/node", () => ({
  captureMessage: vi.fn(),
}));
vi.mock("../asset-upload-utils", () => ({
  uploadAgenticInstructionsToS3: vi.fn(),
}));
vi.mock("../upload-build", () => ({
  uploadBuild: vi.fn(),
}));

describe("generateSessions container deployment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({} as never);
    vi.mocked(uploadBuild).mockResolvedValue({
      deploymentId: "deployment123",
      uploadId: "upload123",
      imageReference: "registry.example/app:upload123",
    });
    vi.mocked(completeAgenticSessionGeneration).mockResolvedValue({
      agenticRunId: "run123",
    });
  });

  it("registers the pushed container before launching Agent swarm", async () => {
    await generateSessions({
      apiToken: "token",
      projectId: "project123",
      localImageTag: "app:head",
      commitSha: "abc123",
      containerPort: 3000,
      containerEnv: [{ name: "FOO", value: "bar" }],
      containerHealthCheckEndpoint: "/health",
    });

    expect(uploadBuild).toHaveBeenCalledWith({
      apiToken: "token",
      commitSha: "abc123",
      localImageTag: "app:head",
      containerPort: 3000,
      containerEnv: [{ name: "FOO", value: "bar" }],
      containerHealthCheckEndpoint: "/health",
      projectId: "project123",
    });
    expect(vi.mocked(uploadBuild).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(completeAgenticSessionGeneration).mock.invocationCallOrder[0],
    );
  });

  it("carries a staging backend and its env-var name on the container appTarget", async () => {
    await generateSessions({
      apiToken: "token",
      projectId: "project123",
      localImageTag: "app:head",
      commitSha: "abc123",
      backend: {
        url: "https://staging.example.com",
        loginOptions: { username: "u" },
        proxyPaths: ["/api"],
      },
      backendUrlEnvVariable: "API_ORIGIN",
    });

    expect(completeAgenticSessionGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        appTarget: expect.objectContaining({
          type: "container",
          backend: {
            url: "https://staging.example.com",
            loginOptions: { username: "u" },
            proxyPaths: ["/api"],
          },
          backendUrlEnvVariable: "API_ORIGIN",
        }),
      }),
    );
  });

  it("does not launch Agent swarm when registration fails", async () => {
    vi.mocked(uploadBuild).mockRejectedValue(new Error("registration failed"));

    await expect(
      generateSessions({
        apiToken: "token",
        localImageTag: "app:head",
        commitSha: "abc123",
      }),
    ).rejects.toThrow("registration failed");

    expect(completeAgenticSessionGeneration).not.toHaveBeenCalled();
  });
});

describe("generateSessions appTarget deployment reference", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({} as never);
    vi.mocked(completeAgenticSessionGeneration).mockResolvedValue({
      agenticRunId: "run123",
    });
  });

  it("names a freshly uploaded container by its deployment row", async () => {
    vi.mocked(uploadBuild).mockResolvedValue({
      deploymentId: "deployment123",
      uploadId: "upload123",
      imageReference: "registry.example/app:upload123",
    });

    await generateSessions({
      apiToken: "token",
      projectId: "project123",
      localImageTag: "app:head",
      commitSha: "abc123",
      containerPort: 3000,
    });

    expect(completeAgenticSessionGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        appTarget: {
          type: "container",
          projectDeploymentId: "deployment123",
          uploadId: "upload123",
          enableLocalMocks: undefined,
          containerPort: 3000,
          containerEnv: undefined,
          containerHealthCheckEndpoint: undefined,
        },
      }),
    );
  });

  it("names a freshly uploaded assets build by its deployment row", async () => {
    vi.mocked(uploadBuild).mockResolvedValue({
      deploymentId: "deployment456",
      uploadId: "upload456",
    });

    await generateSessions({
      apiToken: "token",
      projectId: "project123",
      assetsDirectory: "dist",
      commitSha: "abc123",
    });

    expect(completeAgenticSessionGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        appTarget: {
          type: "assets",
          projectDeploymentId: "deployment456",
          assetsUploadId: "upload456",
        },
      }),
    );
  });
});

describe("generateSessions Agent swarm kind", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({} as never);
    vi.mocked(uploadBuild).mockResolvedValue({
      deploymentId: "deployment456",
      uploadId: "upload456",
    });
  });

  it("sends the kind it launches and returns the kind the backend reports", async () => {
    vi.mocked(completeAgenticSessionGeneration).mockResolvedValue({
      agenticRunId: "run123",
      swarmKind: "preview-url",
    });

    const result = await generateSessions({
      apiToken: "token",
      projectId: "project123",
      assetsDirectory: "placeholder",
      commitSha: "abc123",
      swarmKind: "preview-url",
      backend: { url: "https://pr-12.preview.example.com", proxyPaths: ["/"] },
    });

    expect(completeAgenticSessionGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ swarmKind: "preview-url" }),
    );
    expect(result).toMatchObject({
      agenticRunId: "run123",
      swarmKind: "preview-url",
    });
  });

  it("sends no kind for a regular launch and reports none from an older backend", async () => {
    vi.mocked(completeAgenticSessionGeneration).mockResolvedValue({
      agenticRunId: "run123",
    });

    const result = await generateSessions({
      apiToken: "token",
      projectId: "project123",
      assetsDirectory: "dist",
      commitSha: "abc123",
    });

    expect(
      vi.mocked(completeAgenticSessionGeneration).mock.calls[0]?.[0],
    ).not.toHaveProperty("swarmKind");
    expect(result).not.toHaveProperty("swarmKind");
  });
});

describe("preview URL target", () => {
  it("launches against the URL directly, without uploading or registering anything", async () => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({} as never);
    vi.mocked(completeAgenticSessionGeneration).mockResolvedValue({
      agenticRunId: "run",
    });
    await generateSessions({
      apiToken: "token",
      projectId: "project",
      previewUrl: "https://head.example.com",
      commitSha: "a".repeat(40),
    });
    expect(completeAgenticSessionGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        appTarget: {
          type: "url",
          url: "https://head.example.com",
        },
      }),
    );
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining("URL: https://head.example.com"),
    );
    expect(uploadBuild).not.toHaveBeenCalled();
  });

  it("launches an explicit URL pair with the base URL on the app target", async () => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({} as never);
    vi.mocked(completeAgenticSessionGeneration).mockResolvedValue({
      agenticRunId: "run",
    });
    await generateSessions({
      apiToken: "token",
      projectId: "project",
      previewUrl: "https://head.example.com",
      basePreviewUrl: "https://base.example.com",
      baseSha: "b".repeat(40),
      commitSha: "a".repeat(40),
    });
    expect(completeAgenticSessionGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        baseSha: "b".repeat(40),
        appTarget: {
          type: "url",
          url: "https://head.example.com",
          baseUrl: "https://base.example.com",
        },
      }),
    );
  });

  it("rejects a base URL without baseSha", async () => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({} as never);
    await expect(
      generateSessions({
        apiToken: "token",
        projectId: "project",
        previewUrl: "https://head.example.com",
        basePreviewUrl: "https://base.example.com",
        commitSha: "a".repeat(40),
      }),
    ).rejects.toThrow(/baseSha/);
    expect(completeAgenticSessionGeneration).not.toHaveBeenCalled();
  });
});

describe("launch egress rules", () => {
  it("forwards extra egress rules independently of the app target", async () => {
    vi.mocked(createClient).mockReturnValue({} as never);
    vi.mocked(completeAgenticSessionGeneration).mockResolvedValue({
      agenticRunId: "run123",
    });
    const egressRules = [
      { type: "allow" as const, domains: ["api.example.com"], ports: [443] },
    ];

    await generateSessions({
      apiToken: "token",
      projectId: "project123",
      previewUrl: "https://head.example.com",
      commitSha: "abc123",
      egressRules,
    });

    expect(completeAgenticSessionGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ egressRules }),
    );
  });
});

describe("launch host rewrite override", () => {
  it("forwards hostRewriteRegex", async () => {
    vi.mocked(createClient).mockReturnValue({} as never);
    vi.mocked(completeAgenticSessionGeneration).mockResolvedValue({
      agenticRunId: "run123",
    });

    await generateSessions({
      apiToken: "token",
      projectId: "project123",
      previewUrl: "https://head.example.com",
      commitSha: "abc123",
      hostRewriteRegex: "(^|\\.)example\\.com$",
    });

    expect(completeAgenticSessionGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        hostRewriteRegex: "(^|\\.)example\\.com$",
      }),
    );
  });
});
