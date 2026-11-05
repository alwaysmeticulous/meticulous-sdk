import { mkdtemp, readFile, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type * as Common from "@alwaysmeticulous/common";
import type { RunCrawlOptions } from "@alwaysmeticulous/sdk-bundles-api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crawlCommand, LOGIN_REQUIRED_EXIT_CODE } from "../../crawl.command";

const loggerMock = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  getLevel: () => 2,
};

const mocks = vi.hoisted(() => ({
  resolveApiTokenWithOAuth: vi.fn(),
  createClientWithOAuth: vi.fn(),
  getProject: vi.fn(),
  createCrawlerTestRun: vi.fn(),
  resolveProjectIdentifier: vi.fn(),
  loadRunCrawlBundle: vi.fn(),
  runCrawl: vi.fn(),
}));

vi.mock("../../../command-utils/sentry.utils", () => ({
  wrapHandler: (fn: (...args: unknown[]) => Promise<void>) => fn,
}));

vi.mock("@alwaysmeticulous/common", async (importOriginal) => {
  const actual = await importOriginal<typeof Common>();
  return { ...actual, initLogger: () => loggerMock };
});

vi.mock("@alwaysmeticulous/client", () => ({
  resolveApiTokenWithOAuth: mocks.resolveApiTokenWithOAuth,
  createClientWithOAuth: mocks.createClientWithOAuth,
  getProject: mocks.getProject,
  createCrawlerTestRun: mocks.createCrawlerTestRun,
}));

vi.mock("../../../utils/resolve-project-identifier", () => ({
  resolveProjectIdentifier: mocks.resolveProjectIdentifier,
}));

vi.mock("../load-run-crawl-bundle", () => ({
  loadRunCrawlBundle: mocks.loadRunCrawlBundle,
}));

class ExitError extends Error {
  constructor(readonly code: number | undefined) {
    super(`process.exit(${code})`);
  }
}

const ALL_CAPABILITIES = {
  headless: true,
  storageToSeed: true,
  visitedUrls: true,
};

const runHandler = async (args: Record<string, unknown>) => {
  try {
    await (
      crawlCommand as { handler: (args: unknown) => Promise<void> }
    ).handler({
      apiToken: undefined,
      crawlingTimeoutSeconds: 120,
      maxNumSessions: 200,
      explorationMode: "default",
      skipTestRun: true,
      headless: false,
      nonInteractive: false,
      storageState: undefined,
      outputFile: undefined,
      ...args,
    });
  } catch (error) {
    if (error instanceof ExitError) {
      return error.code;
    }
    throw error;
  }
  return undefined;
};

const lastRunCrawlOptions = (): RunCrawlOptions =>
  mocks.runCrawl.mock.calls.at(-1)?.[0] as RunCrawlOptions;

describe("crawl command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new ExitError(code as number | undefined);
    });
    mocks.resolveApiTokenWithOAuth.mockResolvedValue("token");
    mocks.resolveProjectIdentifier.mockResolvedValue({ projectId: "p" });
    mocks.createClientWithOAuth.mockResolvedValue({});
    mocks.getProject.mockResolvedValue({
      organization: { name: "org" },
      name: "project",
    });
    mocks.runCrawl.mockResolvedValue({
      sessionIds: ["s1", "s2"],
      uniqueUrlCount: 2,
      visitedUrls: ["http://localhost:3000/", "http://localhost:3000/a"],
    });
    mocks.loadRunCrawlBundle.mockResolvedValue({
      runCrawl: mocks.runCrawl,
      capabilities: ALL_CAPABILITIES,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("pauses for a manual login and runs headed by default", async () => {
    await runHandler({ startUrl: ["http://localhost:3000/"] });

    const options = lastRunCrawlOptions();
    expect(options.onReadyForManualLogin).toBeTypeOf("function");
    expect(options.headless).toBe(false);
    expect(options.storageToSeed).toBeUndefined();
  });

  it("never pauses for a login with --nonInteractive", async () => {
    const exitCode = await runHandler({
      startUrl: ["http://localhost:3000/"],
      nonInteractive: true,
    });

    expect(exitCode).toBe(0);
    expect(lastRunCrawlOptions().onReadyForManualLogin).toBeUndefined();
  });

  it("passes --headless through and skips the login pause", async () => {
    await runHandler({ startUrl: ["http://localhost:3000/"], headless: true });

    const options = lastRunCrawlOptions();
    expect(options.headless).toBe(true);
    expect(options.onReadyForManualLogin).toBeUndefined();
  });

  it("warns but still crawls when the bundle predates --headless", async () => {
    mocks.loadRunCrawlBundle.mockResolvedValue({
      runCrawl: mocks.runCrawl,
      capabilities: {},
    });

    const exitCode = await runHandler({
      startUrl: ["http://localhost:3000/"],
      headless: true,
    });

    expect(exitCode).toBe(0);
    expect(mocks.runCrawl).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.stringContaining("doesn't support --headless"),
    );
  });

  it("loads --storageState and passes it to the bundle", async () => {
    const dir = await mkdtemp(join(tmpdir(), "crawl-command-"));
    const storageState = join(dir, "state.json");
    await writeFile(
      storageState,
      JSON.stringify({
        cookies: [{ name: "sid", value: "1", domain: "localhost" }],
        origins: [
          {
            origin: "http://localhost:3000",
            localStorage: [{ name: "token", value: "t" }],
          },
        ],
      }),
    );

    await runHandler({
      startUrl: ["http://localhost:3000/"],
      nonInteractive: true,
      storageState,
    });

    expect(lastRunCrawlOptions().storageToSeed).toEqual({
      cookies: [
        { name: "sid", value: "1", domain: "localhost", expires: null },
      ],
      localStorageEntries: [{ key: "token", value: "t" }],
      sessionStorageEntries: [],
    });
  });

  it("refuses --storageState when the bundle predates it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "crawl-command-"));
    const storageState = join(dir, "state.json");
    await writeFile(storageState, JSON.stringify({ cookies: [] }));
    mocks.loadRunCrawlBundle.mockResolvedValue({
      runCrawl: mocks.runCrawl,
      capabilities: {},
    });

    const exitCode = await runHandler({
      startUrl: ["http://localhost:3000/"],
      storageState,
    });

    expect(exitCode).toBe(1);
    expect(mocks.runCrawl).not.toHaveBeenCalled();
  });

  it("fails before authenticating on an unreadable --storageState", async () => {
    const exitCode = await runHandler({
      startUrl: ["http://localhost:3000/"],
      storageState: "/nonexistent/state.json",
    });

    expect(exitCode).toBe(1);
    expect(mocks.resolveApiTokenWithOAuth).not.toHaveBeenCalled();
  });

  it("writes the crawl summary to --outputFile", async () => {
    const dir = await mkdtemp(join(tmpdir(), "crawl-command-"));
    const outputFile = join(dir, "out.json");

    await runHandler({
      startUrl: ["http://localhost:3000/", "http://localhost:3000/"],
      nonInteractive: true,
      outputFile,
    });

    expect(JSON.parse(await readFile(outputFile, "utf8"))).toEqual({
      sessionIds: ["s1", "s2"],
      startUrls: ["http://localhost:3000/"],
      numSessions: 2,
      uniqueUrlCount: 2,
      loginWallDetected: false,
    });
  });

  it("exits with the login-required code when a non-interactive crawl only reached login pages", async () => {
    const dir = await mkdtemp(join(tmpdir(), "crawl-command-"));
    const outputFile = join(dir, "out.json");
    mocks.runCrawl.mockResolvedValue({
      sessionIds: ["s1"],
      uniqueUrlCount: 1,
      visitedUrls: ["http://localhost:3000/login"],
    });

    const exitCode = await runHandler({
      startUrl: ["http://localhost:3000/"],
      nonInteractive: true,
      outputFile,
    });

    expect(exitCode).toBe(LOGIN_REQUIRED_EXIT_CODE);
    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.stringContaining("--storageState"),
    );
    const report = JSON.parse(await readFile(outputFile, "utf8")) as {
      loginWallDetected: boolean | null;
    };
    expect(report.loginWallDetected).toBe(true);
  });

  it("only warns about a login wall when the user had the chance to log in", async () => {
    mocks.runCrawl.mockResolvedValue({
      sessionIds: ["s1"],
      uniqueUrlCount: 1,
      visitedUrls: ["http://localhost:3000/login"],
    });

    const exitCode = await runHandler({ startUrl: ["http://localhost:3000/"] });

    expect(exitCode).toBe(0);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.stringContaining("only reached login pages"),
    );
  });

  it("exits 1 when no sessions were recorded", async () => {
    mocks.runCrawl.mockResolvedValue({ sessionIds: [], uniqueUrlCount: 0 });

    const exitCode = await runHandler({
      startUrl: ["http://localhost:3000/"],
      nonInteractive: true,
    });

    expect(exitCode).toBe(1);
  });
});
