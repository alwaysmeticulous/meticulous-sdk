import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sessionsCommand } from "./sessions.command";

// Make wrapHandler a passthrough so handler errors propagate directly to tests
// rather than being swallowed by process.exit().
vi.mock("../../command-utils/sentry.utils", () => ({
  wrapHandler: (fn: (...args: unknown[]) => Promise<void>) => fn,
}));

const loggerMock = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

const mocks = vi.hoisted(() => ({
  createClientWithOAuth: vi.fn(),
  getSessions: vi.fn(),
  logNotice: vi.fn(),
}));

vi.mock("@alwaysmeticulous/common", () => ({
  initLogger: () => loggerMock,
  logNotice: mocks.logNotice,
}));

vi.mock("@alwaysmeticulous/client", () => ({
  createClientWithOAuth: mocks.createClientWithOAuth,
  getSessions: mocks.getSessions,
}));

const runHandler = (
  args: {
    json?: boolean;
    project?: string;
    createdSince?: string;
    createdUntil?: string;
    recordedSince?: string;
    recordedUntil?: string;
    recordedBy?: string;
    excludeSyntheticSessions?: boolean;
    visitedUrlFilter?: string;
    includeDurationSeconds?: boolean;
    includeNumberUserEvents?: boolean;
    includeNumberUrlsVisited?: boolean;
    includeStartUrl?: boolean;
    includeAbandonedReason?: boolean;
    limit?: number;
    offset?: number;
  } = {},
) =>
  (sessionsCommand as { handler: (args: unknown) => Promise<void> }).handler({
    json: false,
    ...args,
  });

let logSpy: ReturnType<typeof vi.spyOn>;
const stdoutText = () => logSpy.mock.calls.flat().join("\n");
const noticeText = () => mocks.logNotice.mock.calls.flat().join("\n");

// Rich rows (with the opt-in startUrl/abandonedReason present) so column
// rendering can be exercised by toggling the flags on runHandler; the mock
// returns these regardless of args.
const SESSIONS = [
  {
    id: "session-1",
    createdAt: "2026-07-16T00:00:00.000Z",
    recordedAt: "2026-07-16T00:00:00.000Z",
    recordedBy: "a@b.com",
    status: "original",
    startUrl: "https://example.com",
    durationSeconds: 42,
    numberUserEvents: 7,
    numberUrlsVisited: 2,
  },
  {
    id: "session-2_p1704825600000",
    createdAt: "2026-07-20T00:00:00.000Z",
    recordedAt: "2026-07-15T00:00:00.000Z",
    status: "patched",
    startUrl: "https://example.com/login",
    // Omitted models a session where a duration couldn't be computed (e.g.
    // recorded before duration tracking existed).
    numberUserEvents: 3,
    numberUrlsVisited: 4,
    abandonedReason: "max_session_time",
  },
];

describe("sessions command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClientWithOAuth.mockResolvedValue({});
    mocks.getSessions.mockResolvedValue({ sessions: SESSIONS });
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("emits JSON as a bare session array (matching the MCP tool)", async () => {
    await runHandler({ json: true });

    expect(JSON.parse(stdoutText())).toEqual(SESSIONS);
  });

  it("emits a TSV header, then one row per session (default columns)", async () => {
    await runHandler({ json: false });

    const lines = stdoutText().split("\n");
    expect(lines[0]).toBe(
      ["id", "createdAt", "recordedAt", "recordedBy", "status"].join("\t"),
    );
    expect(lines[1]).toBe(
      [
        "session-1",
        "2026-07-16T00:00:00.000Z",
        "2026-07-16T00:00:00.000Z",
        "a@b.com",
        "original",
      ].join("\t"),
    );
    expect(lines[2]).toBe(
      [
        "session-2_p1704825600000",
        "2026-07-20T00:00:00.000Z",
        "2026-07-15T00:00:00.000Z",
        "",
        "patched",
      ].join("\t"),
    );
  });

  it("appends requested optional columns in output order", async () => {
    await runHandler({
      json: false,
      includeDurationSeconds: true,
      includeNumberUserEvents: true,
      includeNumberUrlsVisited: true,
      includeStartUrl: true,
      includeAbandonedReason: true,
    });

    const lines = stdoutText().split("\n");
    expect(lines[0]).toBe(
      [
        "id",
        "createdAt",
        "recordedAt",
        "recordedBy",
        "status",
        "durationSeconds",
        "numberUserEvents",
        "numberUrlsVisited",
        "startUrl",
        "abandonedReason",
      ].join("\t"),
    );
    // session-1: has durationSeconds and startUrl, not abandoned (empty
    // abandonedReason cell).
    expect(lines[1].endsWith("\t42\t7\t2\thttps://example.com\t")).toBe(true);
    // session-2: has no durationSeconds (empty cell), has everything else.
    expect(
      lines[2].endsWith(
        "\t\t3\t4\thttps://example.com/login\tmax_session_time",
      ),
    ).toBe(true);
  });

  it("--excludeSyntheticSessions drops the status column", async () => {
    await runHandler({ json: false, excludeSyntheticSessions: true });

    expect(stdoutText().split("\n")[0]).toBe(
      ["id", "createdAt", "recordedAt", "recordedBy"].join("\t"),
    );
  });

  it("prints a notice on stderr (not stdout) when there are no sessions", async () => {
    mocks.getSessions.mockResolvedValue({ sessions: [] });

    await runHandler({ json: false });

    expect(stdoutText()).toBe("");
    expect(noticeText()).toContain("No recorded sessions found");
  });

  it("prints the returned session count on stderr (both TSV and JSON modes)", async () => {
    await runHandler({ json: false });
    expect(noticeText()).toContain("2 session(s)");

    vi.clearAllMocks();
    mocks.createClientWithOAuth.mockResolvedValue({});
    mocks.getSessions.mockResolvedValue({ sessions: SESSIONS });
    await runHandler({ json: true });
    expect(noticeText()).toContain("2 session(s)");
  });

  it("hints that more may be available when the page fills the limit", async () => {
    await runHandler({ json: false, limit: 2 });

    expect(noticeText()).toMatch(/2 session\(s\).*limit reached.*--offset/);
  });

  it("passes all filter/pagination options through to the client call", async () => {
    await runHandler({
      project: "my-org/my-proj",
      createdSince: "2026-06-01",
      createdUntil: "2026-06-10",
      recordedSince: "2026-07-01",
      recordedUntil: "2026-07-10",
      recordedBy: "a@b.com",
      excludeSyntheticSessions: true,
      visitedUrlFilter: "*/checkout*",
      includeDurationSeconds: true,
      includeNumberUserEvents: true,
      includeNumberUrlsVisited: true,
      includeStartUrl: true,
      includeAbandonedReason: true,
      limit: 25,
      offset: 50,
    });

    expect(mocks.getSessions).toHaveBeenCalledWith(
      {},
      {
        project: "my-org/my-proj",
        createdSince: "2026-06-01",
        createdUntil: "2026-06-10",
        recordedSince: "2026-07-01",
        recordedUntil: "2026-07-10",
        recordedBy: "a@b.com",
        excludeSyntheticSessions: true,
        visitedUrlFilter: "*/checkout*",
        includeDurationSeconds: true,
        includeNumberUserEvents: true,
        includeNumberUrlsVisited: true,
        includeStartUrl: true,
        includeAbandonedReason: true,
        limit: 25,
        offset: 50,
      },
    );
  });

  it("passes undefined options through when omitted (server picks the defaults)", async () => {
    await runHandler({});

    expect(mocks.getSessions).toHaveBeenCalledWith(
      {},
      {
        project: undefined,
        createdSince: undefined,
        createdUntil: undefined,
        recordedSince: undefined,
        recordedUntil: undefined,
        recordedBy: undefined,
        excludeSyntheticSessions: undefined,
        visitedUrlFilter: undefined,
        includeDurationSeconds: undefined,
        includeNumberUserEvents: undefined,
        includeNumberUrlsVisited: undefined,
        includeStartUrl: undefined,
        includeAbandonedReason: undefined,
        limit: undefined,
        offset: undefined,
      },
    );
  });
});

describe("sessions --limit coerce", () => {
  const coerce = (
    sessionsCommand.builder as {
      limit: { coerce: (value: number | undefined) => number | undefined };
    }
  ).limit.coerce;

  it("passes undefined through unchanged", () => {
    expect(coerce(undefined)).toBeUndefined();
  });

  it("accepts values within 1-1000", () => {
    expect(coerce(1)).toBe(1);
    expect(coerce(1000)).toBe(1000);
  });

  it("rejects 0, negative, non-integer, and above-1000 values", () => {
    expect(() => coerce(0)).toThrow(/between 1 and 1000/);
    expect(() => coerce(-1)).toThrow(/between 1 and 1000/);
    expect(() => coerce(1.5)).toThrow(/between 1 and 1000/);
    expect(() => coerce(1001)).toThrow(/between 1 and 1000/);
  });
});

describe("sessions --offset coerce", () => {
  const coerce = (
    sessionsCommand.builder as {
      offset: { coerce: (value: number | undefined) => number | undefined };
    }
  ).offset.coerce;

  it("passes undefined through unchanged", () => {
    expect(coerce(undefined)).toBeUndefined();
  });

  it("accepts 0 and positive integers", () => {
    expect(coerce(0)).toBe(0);
    expect(coerce(500)).toBe(500);
  });

  it("rejects negative and non-integer values", () => {
    expect(() => coerce(-1)).toThrow(/non-negative integer/);
    expect(() => coerce(1.5)).toThrow(/non-negative integer/);
  });
});
