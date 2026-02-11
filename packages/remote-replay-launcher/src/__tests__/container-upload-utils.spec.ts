import { createClient, getRegistryAuth, completeContainerUpload } from "@alwaysmeticulous/client";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import Docker from "dockerode";
import { uploadContainer } from "../container-upload-utils";

// Mock the dependencies
vi.mock("@alwaysmeticulous/client", () => ({
  createClient: vi.fn(),
  getRegistryAuth: vi.fn(),
  completeContainerUpload: vi.fn(),
  getApiToken: vi.fn((token) => token || "mocked-token"),
}));
vi.mock("@alwaysmeticulous/common", () => ({
  initLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));
vi.mock("@sentry/node", () => ({
  captureMessage: vi.fn(),
}));
vi.mock("dockerode");
vi.mock("ora", () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    warn: vi.fn().mockReturnThis(),
    text: "",
  })),
}));

describe("uploadContainer", () => {
  let mockDockerClient: any;
  let mockImage: any;
  let mockClient: any;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Mock Docker client and image operations
    mockImage = {
      inspect: vi.fn().mockResolvedValue({
        Id: "sha256:abc123",
        RepoTags: ["myapp:latest"],
      }),
      tag: vi.fn().mockResolvedValue(undefined),
      push: vi.fn((opts, callback) => {
        // Simulate successful push
        const mockStream = {
          on: vi.fn(),
        };
        callback(null, mockStream);
        return mockStream;
      }),
    };

    mockDockerClient = {
      ping: vi.fn().mockResolvedValue(true),
      getImage: vi.fn().mockReturnValue(mockImage),
      modem: {
        followProgress: vi.fn((stream, onFinished, onProgress) => {
          // Simulate progress events
          onProgress({ status: "Pushing", progress: "[==>  ] 50%" });
          onProgress({ status: "Pushed" });
          // Call onFinished to complete the push
          onFinished(null, []);
        }),
      },
    };

    // Mock Docker constructor as a class
    vi.mocked(Docker).mockImplementation(function() {
      return mockDockerClient;
    } as any);

    // Mock client functions
    mockClient = {
      post: vi.fn(),
      get: vi.fn(),
    };
    (createClient as any).mockReturnValue(mockClient);

    (getRegistryAuth as any).mockResolvedValue({
      registryUrl: "registry.meticulous.ai",
      projectName: "test-project",
      robotAccountName: "robot$test",
      robotAccountSecret: "secret123",
      expiresAt: "2024-12-31T23:59:59Z",
      uploadId: "upload-123",
      imageReference: "registry.meticulous.ai/test-project/app:upload-123",
    });

    (completeContainerUpload as any).mockResolvedValue({
      testRun: {
        id: "test-run-123",
        project: {
          name: "test-project",
          organization: {
            name: "test-org",
          },
        },
      },
      baseNotFound: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should successfully upload a container", async () => {
    const result = await uploadContainer({
      apiToken: "test-token",
      localImageTag: "myapp:latest",
      commitSha: "abc123def456",
      waitForBase: false,
    });

    expect(result.uploadId).toBe("upload-123");
    expect(result.testRun).toBeDefined();
    expect(result.testRun?.id).toBe("test-run-123");

    // Verify Docker operations were called
    expect(mockDockerClient.ping).toHaveBeenCalled();
    expect(mockDockerClient.getImage).toHaveBeenCalledWith("myapp:latest");
    expect(mockImage.inspect).toHaveBeenCalled();
    expect(mockImage.tag).toHaveBeenCalledWith({
      repo: "registry.meticulous.ai/test-project/app",
      tag: "upload-123",
    });
    expect(mockImage.push).toHaveBeenCalled();

    // Verify API calls
    expect(getRegistryAuth).toHaveBeenCalledWith({ client: mockClient });
    expect(completeContainerUpload).toHaveBeenCalledWith({
      client: mockClient,
      uploadId: "upload-123",
      commitSha: "abc123def456",
      mustHaveBase: false,
    });
  });

  it("should handle Docker daemon not running", async () => {
    mockDockerClient.ping.mockRejectedValue(new Error("Cannot connect to Docker daemon"));

    await expect(
      uploadContainer({
        apiToken: "test-token",
        localImageTag: "myapp:latest",
        commitSha: "abc123def456",
        waitForBase: false,
      })
    ).rejects.toThrow("Docker daemon is not running or unreachable");
  });

  it("should handle image not found", async () => {
    mockImage.inspect.mockRejectedValue(new Error("No such image"));

    await expect(
      uploadContainer({
        apiToken: "test-token",
        localImageTag: "nonexistent:latest",
        commitSha: "abc123def456",
        waitForBase: false,
      })
    ).rejects.toThrow("Docker image 'nonexistent:latest' not found locally");
  });

  it("should handle push failure", async () => {
    mockImage.push.mockImplementation((opts: any, callback: any) => {
      callback(new Error("Push failed: authentication required"), null);
      return null;
    });

    await expect(
      uploadContainer({
        apiToken: "test-token",
        localImageTag: "myapp:latest",
        commitSha: "abc123def456",
        waitForBase: false,
      })
    ).rejects.toThrow("Failed to push Docker image");
  });

  it("should handle tag failure", async () => {
    mockImage.tag.mockRejectedValue(new Error("Tag failed"));

    await expect(
      uploadContainer({
        apiToken: "test-token",
        localImageTag: "myapp:latest",
        commitSha: "abc123def456",
        waitForBase: false,
      })
    ).rejects.toThrow("Failed to tag Docker image");
  });

  it("should wait for base test run when waitForBase is true", async () => {
    // Use fake timers to control polling
    vi.useFakeTimers();

    // First call returns baseNotFound
    (completeContainerUpload as any)
      .mockResolvedValueOnce({
        testRun: null,
        baseNotFound: true,
      })
      // Second call returns test run
      .mockResolvedValueOnce({
        testRun: {
          id: "test-run-456",
          project: {
            name: "test-project",
            organization: {
              name: "test-org",
            },
          },
        },
        baseNotFound: false,
      });

    const resultPromise = uploadContainer({
      apiToken: "test-token",
      localImageTag: "myapp:latest",
      commitSha: "abc123def456",
      waitForBase: true,
    });

    // Advance timers to trigger polling
    await vi.advanceTimersByTimeAsync(15000); // 15 seconds

    const result = await resultPromise;

    expect(result.testRun?.id).toBe("test-run-456");
    expect(completeContainerUpload).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it("should proceed without base after timeout", async () => {
    vi.useFakeTimers();

    let callCount = 0;
    // Always return baseNotFound until timeout, then return test run
    (completeContainerUpload as any).mockImplementation(async () => {
      callCount++;
      // Keep returning baseNotFound for multiple calls (simulating timeout scenario)
      if (callCount <= 30) { // Simulate many polls
        return {
          testRun: null,
          baseNotFound: true,
        };
      }
      // Final call without mustHaveBase returns test run
      return {
        testRun: {
          id: "test-run-789",
          project: {
            name: "test-project",
            organization: {
              name: "test-org",
            },
          },
        },
        baseNotFound: false,
      };
    });

    const resultPromise = uploadContainer({
      apiToken: "test-token",
      localImageTag: "myapp:latest",
      commitSha: "abc123def456",
      waitForBase: true,
    });

    // Fast-forward past the timeout (5 minutes + buffer)
    await vi.advanceTimersByTimeAsync(6 * 60 * 1000);

    const result = await resultPromise;

    expect(result.testRun?.id).toBe("test-run-789");
    expect(callCount).toBeGreaterThan(1); // Should have polled multiple times
    
    vi.useRealTimers();
  });

  it("should handle progress events during push", async () => {
    const progressEvents: any[] = [];
    
    mockDockerClient.modem.followProgress.mockImplementation((stream: any, onFinished: any, onProgress: any) => {
      onProgress({ status: "Preparing", progressDetail: {} });
      onProgress({ status: "Pushing", progress: "[==>  ] 25%" });
      onProgress({ status: "Pushing", progress: "[====> ] 75%" });
      onProgress({ status: "Pushed" });
      onFinished(null, []);
    });

    await uploadContainer({
      apiToken: "test-token",
      localImageTag: "myapp:latest",
      commitSha: "abc123def456",
      waitForBase: false,
    });

    // Verify that progress was tracked (through modem.followProgress)
    expect(mockDockerClient.modem.followProgress).toHaveBeenCalled();
  });
});
