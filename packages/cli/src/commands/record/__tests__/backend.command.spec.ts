import { EventEmitter } from "events";
import type * as Common from "@alwaysmeticulous/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recordBackendCommand } from "../backend.command";
import type * as BackendSidecarUtils from "../backend-sidecar.utils";

const loggerMock = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

class FakeChild extends EventEmitter {
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  kill = vi.fn();
}

const mocks = vi.hoisted(() => ({
  resolveApiTokenWithOAuth: vi.fn(),
  createClientWithOAuth: vi.fn(),
  getProject: vi.fn(),
  resolveProjectIdentifier: vi.fn(),
  fetchAsset: vi.fn(),
  resolveSidecarPort: vi.fn(),
  startSidecar: vi.fn(),
  spawn: vi.fn(),
}));

const sentryMocks = vi.hoisted(() => ({
  captureException: vi.fn(),
}));

vi.mock("../../../command-utils/sentry.utils", () => ({
  wrapHandler: (fn: (...args: unknown[]) => Promise<void>) => fn,
}));

vi.mock("@sentry/node", () => ({
  captureException: sentryMocks.captureException,
}));

vi.mock("@alwaysmeticulous/common", async (importOriginal) => {
  const actual = await importOriginal<typeof Common>();
  return {
    ...actual,
    initLogger: () => loggerMock,
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

vi.mock("../../../utils/resolve-project-identifier", () => ({
  resolveProjectIdentifier: mocks.resolveProjectIdentifier,
}));

vi.mock("../backend-sidecar.utils", async (importOriginal) => {
  const actual = await importOriginal<typeof BackendSidecarUtils>();
  return {
    ...actual,
    resolveSidecarPort: mocks.resolveSidecarPort,
    startSidecar: mocks.startSidecar,
  };
});

vi.mock("child_process", () => ({
  spawn: mocks.spawn,
}));

interface HandlerArgs {
  apiToken?: string | null;
  recordingToken?: string | null;
  port?: number;
  exportMode?: string;
  localOutputDir?: string | null;
  injectSidecarVar?: boolean;
  devCommand?: (string | number)[];
}

const runHandler = (args: HandlerArgs = {}): Promise<void> =>
  (
    recordBackendCommand.handler as unknown as (
      args: HandlerArgs,
    ) => Promise<void>
  )({
    apiToken: null,
    recordingToken: null,
    port: 9670,
    exportMode: "s3",
    localOutputDir: null,
    injectSidecarVar: true,
    ...args,
  });

const SIDECAR_URL = "http://127.0.0.1:9670";

describe("record backend command", () => {
  const originalArgv = process.argv;
  let sidecarHandle: {
    url: string;
    port: number;
    flush: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  };
  let child: FakeChild;
  let signalSnapshot: {
    INT: NodeJS.SignalsListener[];
    TERM: NodeJS.SignalsListener[];
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.argv = ["node", "main.js", "record", "backend"];
    sidecarHandle = {
      url: SIDECAR_URL,
      port: 9670,
      flush: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
    };
    child = new FakeChild();
    mocks.fetchAsset.mockResolvedValue("/tmp/sidecar.bundle.cjs");
    mocks.resolveSidecarPort.mockResolvedValue(9670);
    mocks.startSidecar.mockResolvedValue(sidecarHandle);
    mocks.spawn.mockReturnValue(child);
    signalSnapshot = {
      INT: process.listeners("SIGINT"),
      TERM: process.listeners("SIGTERM"),
    };
  });

  afterEach(() => {
    process.argv = originalArgv;
    // The handler registers process signal listeners; drop the ones this test added.
    for (const listener of process.listeners("SIGINT")) {
      if (!signalSnapshot.INT.includes(listener)) {
        process.removeListener("SIGINT", listener);
      }
    }
    for (const listener of process.listeners("SIGTERM")) {
      if (!signalSnapshot.TERM.includes(listener)) {
        process.removeListener("SIGTERM", listener);
      }
    }
  });

  const runWrapped = async (
    args: HandlerArgs,
    passthrough: string[],
  ): Promise<void> => {
    process.argv = [
      "node",
      "main.js",
      "record",
      "backend",
      "--",
      ...passthrough,
    ];
    const handlerDone = runHandler(args);
    // Let the handler reach the spawn before the child "exits".
    await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalled());
    child.exitCode = 0;
    child.emit("exit", 0, null);
    await handlerDone;
  };

  it("uses --recordingToken without touching the API", async () => {
    await runWrapped({ recordingToken: "direct-token" }, ["node", "dev.js"]);

    expect(mocks.resolveApiTokenWithOAuth).not.toHaveBeenCalled();
    expect(mocks.getProject).not.toHaveBeenCalled();
    expect(mocks.startSidecar).toHaveBeenCalledWith(
      expect.objectContaining({
        env: expect.objectContaining({
          METICULOUS_RECORDING_TOKEN: "direct-token",
          METICULOUS_EXPORT_MODE: "s3",
        }),
      }),
    );
    expect(sidecarHandle.stop).toHaveBeenCalled();
  });

  it("resolves the recording token and project name via the API", async () => {
    mocks.resolveApiTokenWithOAuth.mockResolvedValue("api-token");
    mocks.resolveProjectIdentifier.mockResolvedValue({ projectId: "p-1" });
    mocks.createClientWithOAuth.mockResolvedValue({});
    mocks.getProject.mockResolvedValue({
      recordingToken: "project-recording-token",
      name: "my-project",
      organization: { name: "my-org" },
    });

    await runWrapped({}, ["node", "dev.js"]);

    expect(mocks.startSidecar).toHaveBeenCalledWith(
      expect.objectContaining({
        env: expect.objectContaining({
          METICULOUS_RECORDING_TOKEN: "project-recording-token",
          METICULOUS_PROJECT_NAME: "my-project",
        }),
      }),
    );
  });

  it("fails cleanly in sidecar-only mode when the project has no recording token", async () => {
    mocks.resolveApiTokenWithOAuth.mockResolvedValue("api-token");
    mocks.resolveProjectIdentifier.mockResolvedValue({ projectId: "p-1" });
    mocks.createClientWithOAuth.mockResolvedValue({});
    mocks.getProject.mockResolvedValue({
      recordingToken: null,
      name: "my-project",
      organization: { name: "my-org" },
    });
    process.argv = ["node", "main.js", "record", "backend"];

    await expect(runHandler({})).rejects.toThrow(/recording token/);
    expect(mocks.startSidecar).not.toHaveBeenCalled();
  });

  it("fails cleanly in sidecar-only mode when the sidecar cannot start", async () => {
    mocks.startSidecar.mockRejectedValue(new Error("port bound"));
    process.argv = ["node", "main.js", "record", "backend"];

    await expect(runHandler({ recordingToken: "t" })).rejects.toThrow(
      /port bound/,
    );
  });

  it("injects --var into a recognized wrangler dev command", async () => {
    await runWrapped({ recordingToken: "t" }, ["npx", "wrangler", "dev"]);

    expect(mocks.spawn).toHaveBeenCalledWith(
      "npx",
      ["wrangler", "dev", "--var", `METICULOUS_SIDECAR_URL:${SIDECAR_URL}`],
      expect.objectContaining({
        stdio: "inherit",
        env: expect.objectContaining({
          METICULOUS_SIDECAR_URL: SIDECAR_URL,
        }),
      }),
    );
  });

  it("does not inject with --no-injectSidecarVar and prints instructions", async () => {
    await runWrapped({ recordingToken: "t", injectSidecarVar: false }, [
      "npx",
      "wrangler",
      "dev",
    ]);

    expect(mocks.spawn).toHaveBeenCalledWith(
      "npx",
      ["wrangler", "dev"],
      expect.anything(),
    );
    expect(loggerMock.info).toHaveBeenCalledWith(
      expect.stringContaining("wrangler dev --var METICULOUS_SIDECAR_URL:"),
    );
  });

  it("prints instructions for unrecognized dev commands", async () => {
    await runWrapped({ recordingToken: "t" }, ["npm", "run", "dev"]);

    expect(mocks.spawn).toHaveBeenCalledWith(
      "npm",
      ["run", "dev"],
      expect.anything(),
    );
    expect(loggerMock.info).toHaveBeenCalledWith(
      expect.stringContaining(".dev.vars"),
    );
  });

  describe("when the recorder cannot start in wrapped mode", () => {
    const getSpawnEnv = (): Record<string, string | undefined> =>
      (
        mocks.spawn.mock.calls[0][2] as {
          env: Record<string, string | undefined>;
        }
      ).env;

    it("runs the dev command unrecorded when the sidecar bundle cannot be fetched", async () => {
      mocks.fetchAsset.mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));

      await runWrapped({ recordingToken: "t" }, ["npx", "wrangler", "dev"]);

      // Unmodified argv: without a sidecar there is no URL to inject.
      expect(mocks.spawn).toHaveBeenCalledWith(
        "npx",
        ["wrangler", "dev"],
        expect.anything(),
      );
      expect(getSpawnEnv()).not.toHaveProperty("METICULOUS_SIDECAR_URL");
      expect(loggerMock.warn).toHaveBeenCalledWith(
        expect.stringContaining("running your dev command without it"),
      );
      expect(sentryMocks.captureException).toHaveBeenCalled();
    });

    it("runs the dev command unrecorded when the sidecar does not come up", async () => {
      mocks.startSidecar.mockRejectedValue(
        new Error("The Meticulous sidecar did not become healthy within 15s."),
      );

      await runWrapped({ recordingToken: "t" }, ["npm", "run", "dev"]);

      expect(mocks.spawn).toHaveBeenCalledWith(
        "npm",
        ["run", "dev"],
        expect.anything(),
      );
      expect(getSpawnEnv()).not.toHaveProperty("METICULOUS_SIDECAR_URL");
      expect(loggerMock.warn).toHaveBeenCalledWith(
        expect.stringContaining("running your dev command without it"),
      );
    });

    it("runs the dev command unrecorded when authentication fails", async () => {
      mocks.resolveApiTokenWithOAuth.mockRejectedValue(
        new Error("No API token"),
      );

      await runWrapped({}, ["npx", "wrangler", "dev"]);

      expect(mocks.startSidecar).not.toHaveBeenCalled();
      expect(mocks.spawn).toHaveBeenCalledWith(
        "npx",
        ["wrangler", "dev"],
        expect.anything(),
      );
    });

    it("reports a user error without sending it to Sentry", async () => {
      mocks.resolveApiTokenWithOAuth.mockResolvedValue("api-token");
      mocks.resolveProjectIdentifier.mockResolvedValue({ projectId: "p-1" });
      mocks.createClientWithOAuth.mockResolvedValue({});
      mocks.getProject.mockResolvedValue({
        recordingToken: null,
        name: "my-project",
        organization: { name: "my-org" },
      });

      await runWrapped({}, ["npx", "wrangler", "dev"]);

      expect(loggerMock.error).toHaveBeenCalledWith(
        expect.stringContaining("recording token"),
      );
      expect(sentryMocks.captureException).not.toHaveBeenCalled();
      expect(mocks.spawn).toHaveBeenCalled();
    });
  });

  it("rejects a positional dev command passed without --", async () => {
    process.argv = [
      "node",
      "main.js",
      "record",
      "backend",
      "npx",
      "wrangler",
      "dev",
    ];
    await expect(
      runHandler({
        recordingToken: "t",
        devCommand: ["npx", "wrangler", "dev"],
      }),
    ).rejects.toThrow(/-- separator/);
    expect(mocks.startSidecar).not.toHaveBeenCalled();
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it("runs sidecar-only mode until a signal arrives", async () => {
    process.argv = ["node", "main.js", "record", "backend"];
    const handlerDone = runHandler({ recordingToken: "t" });
    await vi.waitFor(() => expect(mocks.startSidecar).toHaveBeenCalled());
    await vi.waitFor(() =>
      expect(loggerMock.info).toHaveBeenCalledWith(
        expect.stringContaining("Ctrl-C"),
      ),
    );

    process.emit("SIGINT");
    await handlerDone;
    expect(sidecarHandle.stop).toHaveBeenCalled();
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
});
