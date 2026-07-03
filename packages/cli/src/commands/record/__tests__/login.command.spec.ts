import type * as Common from "@alwaysmeticulous/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordLoginCommand } from "../login.command";

const loggerMock = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

const mocks = vi.hoisted(() => ({
  resolveApiTokenWithOAuth: vi.fn(),
  createClientWithOAuth: vi.fn(),
  getProject: vi.fn(),
  resolveProjectIdentifier: vi.fn(),
  fetchAsset: vi.fn(),
  recordLoginFlowSession: vi.fn(),
}));

vi.mock("../../../command-utils/sentry.utils", () => ({
  wrapHandler: (fn: (...args: unknown[]) => Promise<void>) => fn,
}));

vi.mock("@alwaysmeticulous/common", async (importOriginal) => {
  const actual = await importOriginal<typeof Common>();
  return {
    ...actual,
    initLogger: () => loggerMock,
    DebugLogger: { create: vi.fn() },
  };
});

vi.mock("@alwaysmeticulous/client", () => ({
  resolveApiTokenWithOAuth: mocks.resolveApiTokenWithOAuth,
  createClientWithOAuth: mocks.createClientWithOAuth,
  getProject: mocks.getProject,
}));

vi.mock("@alwaysmeticulous/downloading-helpers", () => ({
  fetchAsset: mocks.fetchAsset,
}));

vi.mock("@alwaysmeticulous/record", () => ({
  recordLoginFlowSession: mocks.recordLoginFlowSession,
}));

vi.mock("../../../utils/resolve-project-identifier", () => ({
  resolveProjectIdentifier: mocks.resolveProjectIdentifier,
}));

const runHandler = (args: { apiToken?: string } = {}) =>
  (recordLoginCommand as { handler: (args: unknown) => Promise<void> }).handler(
    args,
  );

describe("record login command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveApiTokenWithOAuth.mockResolvedValue("oauth-token");
    mocks.resolveProjectIdentifier.mockReturnValue({ projectId: "project-id" });
    mocks.createClientWithOAuth.mockResolvedValue({});
    mocks.getProject.mockResolvedValue({
      recordingToken: "recording-token",
      organization: { name: "org" },
      name: "project",
    });
    mocks.fetchAsset.mockResolvedValue("snippet");
    mocks.recordLoginFlowSession.mockResolvedValue(undefined);
  });

  it("builds the client via createClientWithOAuth passing the raw apiToken option", async () => {
    await runHandler({});

    expect(mocks.createClientWithOAuth).toHaveBeenCalledTimes(1);
    expect(mocks.createClientWithOAuth).toHaveBeenCalledWith({
      apiToken: undefined,
      enableOAuthLogin: true,
    });
    expect(mocks.recordLoginFlowSession).toHaveBeenCalledTimes(1);
  });
});
