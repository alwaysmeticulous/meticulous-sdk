import type * as MeticulousClientModule from "@alwaysmeticulous/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import yargs, { type Options as YargsOptions } from "yargs";
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

// Partial: `SESSIONS_ORDER_BY_FIELDS` is the real export the command hands to
// yargs as `choices`, so the argv-parsing tests below reject exactly what the
// published CLI rejects. A local copy would let the two drift silently.
vi.mock("@alwaysmeticulous/client", async (importOriginal) => ({
  ...(await importOriginal<typeof MeticulousClientModule>()),
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
    selectedSet?: string | boolean;
    includeDurationSeconds?: boolean;
    includeNumberUserEvents?: boolean;
    includeNumberUrlsVisited?: boolean;
    includeStartUrl?: boolean;
    includeAbandonedReason?: boolean;
    includeSelectedSince?: boolean;
    includeAdditionalCoverage?: boolean;
    orderBy?: "createdAt" | "rank" | "selectedSince" | "additionalCoverage";
    order?: "asc" | "desc";
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
    selectedSince: "2026-07-05T00:00:00.000Z",
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

  // The sentence is the backend's (`agent.pagination.utils.ts`, tested there),
  // since it knows whether another page exists without counting the set —
  // counting sessions costs seconds on a large project. This command relays it.
  it("relays the backend's paging notice on stderr (both TSV and JSON modes)", async () => {
    mocks.getSessions.mockResolvedValue({
      sessions: SESSIONS,
      notes: ["sessions 1-2; use --offset and/or --limit to view more"],
    });

    await runHandler({ json: false });
    expect(noticeText()).toContain(
      "sessions 1-2; use --offset and/or --limit to view more",
    );

    vi.clearAllMocks();
    mocks.createClientWithOAuth.mockResolvedValue({});
    mocks.getSessions.mockResolvedValue({
      sessions: SESSIONS,
      notes: ["sessions 1-2; use --offset and/or --limit to view more"],
    });
    await runHandler({ json: true });
    expect(noticeText()).toContain(
      "sessions 1-2; use --offset and/or --limit to view more",
    );
  });

  // The project hint is this command's own, not the backend's: it is about
  // which project was searched, not about paging.
  it("keeps its project hint for an empty first page", async () => {
    mocks.getSessions.mockResolvedValue({ sessions: [] });

    await runHandler({ json: false });

    expect(noticeText()).toContain("No recorded sessions found");
  });

  it("leaves an empty later page to the backend's notice", async () => {
    mocks.getSessions.mockResolvedValue({
      sessions: [],
      notes: ["no sessions at offset 500; use a smaller --offset"],
    });

    await runHandler({ json: false, offset: 500 });

    expect(noticeText()).toContain("no sessions at offset 500");
    expect(noticeText()).not.toContain("No recorded sessions found");
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
      selectedSet: "2026-07-08",
      includeDurationSeconds: true,
      includeNumberUserEvents: true,
      includeNumberUrlsVisited: true,
      includeStartUrl: true,
      includeAbandonedReason: true,
      includeSelectedSince: true,
      includeAdditionalCoverage: true,
      orderBy: "rank",
      order: "desc",
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
        selectedSet: "2026-07-08",
        includeDurationSeconds: true,
        includeNumberUserEvents: true,
        includeNumberUrlsVisited: true,
        includeStartUrl: true,
        includeAbandonedReason: true,
        includeSelectedSince: true,
        includeAdditionalCoverage: true,
        orderBy: "rank",
        order: "desc",
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
        selectedSet: undefined,
        includeDurationSeconds: undefined,
        includeNumberUserEvents: undefined,
        includeNumberUrlsVisited: undefined,
        includeStartUrl: undefined,
        includeAbandonedReason: undefined,
        includeSelectedSince: undefined,
        includeAdditionalCoverage: undefined,
        orderBy: undefined,
        order: undefined,
        limit: undefined,
        offset: undefined,
      },
    );
  });

  it("sends a bare --selectedSet as the current set", async () => {
    // yargs gives "" for a value-less string option.
    await runHandler({ selectedSet: "" });

    expect(mocks.getSessions).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ selectedSet: true }),
    );
  });

  it("appends the selectedSince column, passing an undatable entrance's reason through", async () => {
    mocks.getSessions.mockResolvedValueOnce({
      sessions: [
        SESSIONS[0],
        { ...SESSIONS[1], selectedSince: "unknown:scan-budget-exhausted" },
      ],
    });

    await runHandler({
      json: false,
      selectedSet: "",
      includeSelectedSince: true,
    });

    const lines = stdoutText().split("\n");
    expect(lines[0]).toBe(
      [
        "id",
        "createdAt",
        "recordedAt",
        "recordedBy",
        "status",
        "selectedSince",
      ].join("\t"),
    );
    expect(lines[1].endsWith("\t2026-07-05T00:00:00.000Z")).toBe(true);
    expect(lines[2].endsWith("\tunknown:scan-budget-exhausted")).toBe(true);
  });

  it("leaves the selectedSince column empty when the API omits it", async () => {
    // A backend that predates the sentinels omits the field rather than
    // explaining itself, so the column still has to tolerate a missing value.
    await runHandler({
      json: false,
      selectedSet: "",
      includeSelectedSince: true,
    });

    expect(stdoutText().split("\n")[2].endsWith("\tpatched\t")).toBe(true);
  });

  it("passes --orderBy=rank through alongside --selectedSet", async () => {
    await runHandler({ selectedSet: "", orderBy: "rank" });

    expect(mocks.getSessions).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ selectedSet: true, orderBy: "rank" }),
    );
  });

  it("rejects --orderBy=rank without --selectedSet, without calling the API", async () => {
    await expect(runHandler({ orderBy: "rank" })).rejects.toThrow(
      /--orderBy=rank requires --selectedSet/,
    );
    expect(mocks.getSessions).not.toHaveBeenCalled();
  });

  it("allows --orderBy=createdAt without --selectedSet", async () => {
    await runHandler({ orderBy: "createdAt" });

    expect(mocks.getSessions).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ orderBy: "createdAt", selectedSet: undefined }),
    );
  });

  it("passes --orderBy=selectedSince through alongside --selectedSet", async () => {
    await runHandler({ selectedSet: "", orderBy: "selectedSince" });

    expect(mocks.getSessions).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        selectedSet: true,
        orderBy: "selectedSince",
      }),
    );
  });

  it("rejects --orderBy=selectedSince without --selectedSet, without calling the API", async () => {
    await expect(runHandler({ orderBy: "selectedSince" })).rejects.toThrow(
      /--orderBy=selectedSince requires --selectedSet/,
    );
    expect(mocks.getSessions).not.toHaveBeenCalled();
  });

  it("appends the additionalCoverage column, leaving an entry with no figure empty", async () => {
    mocks.getSessions.mockResolvedValue({
      sessions: [{ ...SESSIONS[0], additionalCoverage: 120 }, SESSIONS[1]],
    });

    await runHandler({ selectedSet: "", includeAdditionalCoverage: true });

    const lines = stdoutText().split("\n");
    expect(lines[0].split("\t")).toContain("additionalCoverage");
    expect(lines[1].endsWith("\t120")).toBe(true);
    expect(lines[2].endsWith("\t")).toBe(true);
  });

  it("passes --orderBy=additionalCoverage through alongside --selectedSet", async () => {
    await runHandler({ selectedSet: "", orderBy: "additionalCoverage" });

    expect(mocks.getSessions).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        selectedSet: true,
        orderBy: "additionalCoverage",
      }),
    );
  });

  it("rejects --includeAdditionalCoverage without --selectedSet, without calling the API", async () => {
    await expect(
      runHandler({ includeAdditionalCoverage: true }),
    ).rejects.toThrow(/--includeAdditionalCoverage requires --selectedSet/);
    expect(mocks.getSessions).not.toHaveBeenCalled();
  });

  it("rejects --orderBy=additionalCoverage without --selectedSet, without calling the API", async () => {
    await expect(runHandler({ orderBy: "additionalCoverage" })).rejects.toThrow(
      /--orderBy=additionalCoverage requires --selectedSet/,
    );
    expect(mocks.getSessions).not.toHaveBeenCalled();
  });

  it("passes --order through on its own, for the default ordering", async () => {
    await runHandler({ order: "asc" });

    expect(mocks.getSessions).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ order: "asc" }),
    );
  });

  // Every spelling yargs can produce for an option that takes its value
  // optionally — see `normalizeSelectedSet`. Each of the three beyond the bare
  // flag used to reach the server's ISO-8601 parser and come back a 400.
  it.each([
    ["", true],
    ["true", true],
    ["TRUE", true],
    ["current", "current"],
    ["2026-07-08", "2026-07-08"],
    ["false", undefined],
    [false, undefined],
    [true, true],
  ] as const)(
    "normalizes --selectedSet %o to %o on the wire",
    async (selectedSet, expected) => {
      await runHandler({ selectedSet });

      expect(mocks.getSessions).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ selectedSet: expected }),
      );
    },
  );

  it("treats --no-selectedSet as not asked for, so --orderBy=rank is still rejected", async () => {
    await expect(
      runHandler({ selectedSet: false, orderBy: "rank" }),
    ).rejects.toThrow(/--orderBy=rank requires --selectedSet/);
    expect(mocks.getSessions).not.toHaveBeenCalled();
  });

  it("rejects --includeSelectedSince without --selectedSet, without calling the API", async () => {
    await expect(runHandler({ includeSelectedSince: true })).rejects.toThrow(
      /--includeSelectedSince requires --selectedSet/,
    );
    expect(mocks.getSessions).not.toHaveBeenCalled();
  });

  // The handler tests above inject option values directly, so they cannot see
  // what yargs actually produces from an argv. `--selectedSet` takes its value
  // optionally, which is where the interesting spellings come from.
  describe("yargs parsing layer", () => {
    const parse = (argv: string[]) =>
      yargs(argv)
        .options(sessionsCommand.builder as Record<string, YargsOptions>)
        .fail((msg) => {
          throw new Error(msg);
        })
        .parse() as Record<string, unknown>;

    it.each([
      [["--selectedSet"], ""],
      [["--selectedSet", "2026-07-08"], "2026-07-08"],
      [["--selectedSet=2026-07-08"], "2026-07-08"],
      [["--selectedSet", "true"], "true"],
      [["--selectedSet=false"], "false"],
      [["--no-selectedSet"], false],
    ] as const)("parses %o to selectedSet %o", (argv, expected) => {
      expect(parse([...argv]).selectedSet).toBe(expected);
    });

    it("keeps --selectedSet bare when a flag follows it", () => {
      const parsed = parse(["--selectedSet", "--orderBy", "rank"]);
      expect(parsed.selectedSet).toBe("");
      expect(parsed.orderBy).toBe("rank");
    });

    it("rejects an --orderBy value that isn't an allowed field", () => {
      expect(() => parse(["--orderBy", "recordedAt"])).toThrow();
    });

    it("accepts selectedSince as an --orderBy field", () => {
      expect(parse(["--orderBy", "selectedSince"]).orderBy).toBe(
        "selectedSince",
      );
    });

    it("accepts additionalCoverage as an --orderBy field", () => {
      expect(parse(["--orderBy", "additionalCoverage"]).orderBy).toBe(
        "additionalCoverage",
      );
    });

    it("rejects an --order value that is neither asc nor desc", () => {
      expect(() => parse(["--order", "sideways"])).toThrow();
    });
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
