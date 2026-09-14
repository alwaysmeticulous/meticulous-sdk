import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  testRunEventStatsCommand,
  projectDailyStatsCommand,
  testRunStatsCommand,
} from "./stats.command";

vi.mock("../../command-utils/sentry.utils", () => ({
  wrapHandler: (handler: (...args: unknown[]) => unknown) => handler,
}));

const mocks = vi.hoisted(() => ({
  createClientWithOAuth: vi.fn(),
  getTestRunStats: vi.fn(),
  getProjectDailyStats: vi.fn(),
  getTestRunEventStats: vi.fn(),
  logNotice: vi.fn(),
  appendProjectSelectionHint: vi.fn(),
}));

vi.mock("@alwaysmeticulous/client", () => ({
  createClientWithOAuth: mocks.createClientWithOAuth,
  getTestRunStats: mocks.getTestRunStats,
  getProjectDailyStats: mocks.getProjectDailyStats,
  getTestRunEventStats: mocks.getTestRunEventStats,
}));

vi.mock("@alwaysmeticulous/common", () => ({
  logNotice: mocks.logNotice,
}));

vi.mock("../../utils/project-selection-hint", () => ({
  appendProjectSelectionHint: mocks.appendProjectSelectionHint,
}));

const run = async (
  command: unknown,
  options: Record<string, unknown>,
): Promise<void> =>
  (
    command as { handler: (args: Record<string, unknown>) => Promise<void> }
  ).handler({ json: false, ...options });

const response = (
  data: object[],
  pagination: Record<string, unknown> = {},
) => ({
  data,
  pagination: {
    limit: 100,
    offset: 0,
    totalCount: data.length,
    nextOffset: null,
    ...pagination,
  },
  // Written by the backend (`agent.pagination.utils.ts`, tested there); these
  // commands only relay it.
  notes: ["stats paging notice"],
});

describe("stats commands", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClientWithOAuth.mockResolvedValue({ client: true });
    mocks.appendProjectSelectionHint.mockResolvedValue("with project hint");
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("prints test run stats as TSV and forwards filters", async () => {
    mocks.getTestRunStats.mockResolvedValue(
      response(
        [
          {
            testRunId: "tr-1",
            headCommitSha: "abc",
            diffApprovers: [{ email: "a@example.com" }],
          },
        ],
        { totalCount: 2, nextOffset: 1 },
      ),
    );

    await run(testRunStatsCommand, {
      project: "org/project",
      testRunIds: "tr-1,tr-2",
    });

    expect(mocks.getTestRunStats).toHaveBeenCalledWith(
      { client: true },
      expect.objectContaining({
        project: "org/project",
        testRunIds: "tr-1,tr-2",
      }),
    );
    expect(logSpy.mock.calls[0]?.[0]).toContain(
      "testRunId\tbaseCommitSha\theadCommitSha",
    );
    expect(logSpy.mock.calls[1]?.[0]).toContain('[{"email":"a@example.com"}]');
    expect(mocks.logNotice).toHaveBeenCalledWith("stats paging notice");
  });

  it("prints a bare row list as JSON and no TSV under --json", async () => {
    mocks.getTestRunStats.mockResolvedValue(
      response([{ testRunId: "tr-1", headCommitSha: "abc" }], {
        totalCount: 2,
        nextOffset: 1,
      }),
    );

    await run(testRunStatsCommand, { json: true });

    // stdout carries exactly one thing: the rows, unwrapped, with no header row
    // alongside them and no `pagination` key to step over in a `| jq` pipeline.
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(logSpy.mock.calls[0]?.[0]))).toEqual([
      { testRunId: "tr-1", headCommitSha: "abc" },
    ]);
    // The pagination the wrapper carried is not lost, just moved to stderr,
    // which --json does not suppress.
    expect(mocks.logNotice).toHaveBeenCalledWith("stats paging notice");
  });

  it("still prints valid JSON for an empty result, hinting on stderr", async () => {
    mocks.getTestRunEventStats.mockResolvedValue(response([]));

    await run(testRunEventStatsCommand, { json: true, project: "org/project" });

    expect(JSON.parse(String(logSpy.mock.calls[0]?.[0]))).toEqual([]);
    expect(mocks.appendProjectSelectionHint).toHaveBeenCalledWith(
      "No test-run event stats found for this project.",
      { client: true },
      "org/project",
    );
    expect(mocks.logNotice).toHaveBeenCalledWith("with project hint");
  });

  it("prints no TSV rows for an empty result without --json", async () => {
    mocks.getProjectDailyStats.mockResolvedValue(response([]));

    await run(projectDailyStatsCommand, {
      since: "2026-09-01",
      until: "2026-09-09",
    });

    // Not even a header row: an empty table reads as "these columns exist and
    // matched nothing", which is the hint's job to explain instead.
    expect(logSpy).not.toHaveBeenCalled();
    expect(mocks.logNotice).toHaveBeenCalledWith("with project hint");
  });

  it("forwards both dates to project daily stats", async () => {
    mocks.getProjectDailyStats.mockResolvedValue(response([]));

    await run(projectDailyStatsCommand, {
      since: "2026-09-01",
      until: "2026-09-09",
    });

    expect(mocks.getProjectDailyStats).toHaveBeenCalledWith(
      { client: true },
      expect.objectContaining({
        since: "2026-09-01",
        until: "2026-09-09",
      }),
    );
  });

  it("accepts since without until, leaving the bound to the server", async () => {
    mocks.getProjectDailyStats.mockResolvedValue(response([]));

    await run(projectDailyStatsCommand, { since: "2026-09-01" });

    // Sent absent rather than filled in client-side: "now" has to be the
    // server's clock, and an omitted param is what makes it default there.
    const options = mocks.getProjectDailyStats.mock.calls[0][1];
    expect(options.since).toBe("2026-09-01");
    expect(options.until).toBeUndefined();
  });

  it.each([
    ["test-run-stats", () => testRunStatsCommand],
    ["test-run-event-stats", () => testRunEventStatsCommand],
    ["project-daily-stats", () => projectDailyStatsCommand],
  ])("documents the scope requirement in %s's describe", (_name, command) => {
    // The docs page is a bare command index, so `describe` is the only place a
    // caller meets this rule before the server rejects them.
    expect((command() as { describe: string }).describe).toMatch(
      /--until defaults to now/,
    );
  });

  it("reports the event cursor for the next page", async () => {
    mocks.getTestRunEventStats.mockResolvedValue(
      response([{ eventType: "test_run_viewed" }], {
        totalCount: null,
        nextCursor: "next-page",
      }),
    );

    await run(testRunEventStatsCommand, { eventTypes: "test_run_viewed" });

    expect(mocks.getTestRunEventStats).toHaveBeenCalledWith(
      { client: true },
      expect.objectContaining({ eventTypes: "test_run_viewed" }),
    );
    // "repeat this command with" rather than the bare flag: a cursor carries
    // position, not scope, so `--cursor` on its own is rejected by the server.
    expect(mocks.logNotice).toHaveBeenCalledWith("stats paging notice");
  });
});
