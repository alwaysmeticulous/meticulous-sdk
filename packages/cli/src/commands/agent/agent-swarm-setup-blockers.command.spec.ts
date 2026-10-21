import type * as Client from "@alwaysmeticulous/client";
import { serializeJson } from "@alwaysmeticulous/common/json";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { agentSwarmSetupBlockersCommand } from "./agent-swarm-setup-blockers.command";

vi.mock("../../command-utils/sentry.utils", () => ({
  wrapHandler: (fn: (...args: unknown[]) => Promise<void>) => fn,
}));

const mocks = vi.hoisted(() => ({
  createClientWithOAuth: vi.fn(),
  getAgentSwarmSetupBlockers: vi.fn(),
  logNotice: vi.fn(),
  appendProjectSelectionHint: vi.fn(),
}));

vi.mock("@alwaysmeticulous/common", () => ({
  initLogger: vi.fn(),
  logNotice: mocks.logNotice,
  logProgress: vi.fn(),
}));
vi.mock("@alwaysmeticulous/client", async (importOriginal) => ({
  ...(await importOriginal<typeof Client>()),
  createClientWithOAuth: mocks.createClientWithOAuth,
  getAgentSwarmSetupBlockers: mocks.getAgentSwarmSetupBlockers,
}));
vi.mock("../../utils/project-selection-hint", () => ({
  appendProjectSelectionHint: mocks.appendProjectSelectionHint,
}));

const run = (args: Record<string, unknown>) =>
  (
    agentSwarmSetupBlockersCommand as unknown as {
      handler: (args: unknown) => Promise<void>;
    }
  ).handler(args);

const defaults = {
  project: undefined,
  since: undefined,
  category: undefined,
  runId: undefined,
  limit: undefined,
  offset: undefined,
  json: false,
};

const body: Client.AgentSwarmSetupBlockersResponse = {
  since: "2026-09-20T00:00:00.000Z",
  counts: [
    { category: "missingTestData", count: 1 },
    { category: "testUserPermissions", count: 0 },
  ],
  setupBlockers: [
    {
      createdAt: "2026-10-19T01:02:03.000Z",
      swarmRunId: "run-1",
      caseIndex: 2,
      caseId: "case-2",
      commitSha: "abc",
      category: "missingTestData",
      blockedBy: "application",
      caseTitle: "Archive\tan order",
      summary: "No orders are seeded.",
      evidence: "GET /api/orders returned\nan empty list.",
      suggestedFix: "Seed an order for the test user.",
      fallbackOutcome: "pass",
    },
  ],
};
const note =
  "setup blockers 1-1, newest first; use --offset and/or --limit to view more";

describe("agent agent-swarm-setup-blockers", () => {
  const client = {};
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClientWithOAuth.mockResolvedValue(client);
    mocks.getAgentSwarmSetupBlockers.mockResolvedValue({
      ...body,
      notes: [note],
    });
    mocks.appendProjectSelectionHint.mockImplementation((message: string) =>
      Promise.resolve(`${message} (hint)`),
    );
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => logSpy.mockRestore());

  it("passes every filter to the API", async () => {
    await run({
      ...defaults,
      project: "org/proj",
      since: "2026-10-01",
      category: "missingTestData",
      runId: "run-1",
      limit: 5,
      offset: 10,
    });

    expect(mocks.getAgentSwarmSetupBlockers).toHaveBeenCalledWith(client, {
      project: "org/proj",
      since: "2026-10-01",
      category: "missingTestData",
      runId: "run-1",
      limit: 5,
      offset: 10,
    });
  });

  it("prints the setup blockers as TSV and the counts and paging on stderr", async () => {
    await run(defaults);

    expect(logSpy.mock.calls.map((call: unknown[]) => call[0])).toEqual([
      "createdAt\tswarmRunId\tcaseIndex\tcaseId\tcommitSha\tcategory\tblockedBy\tcaseTitle\tsummary\tevidence\tsuggestedFix\tfallbackOutcome",
      "2026-10-19T01:02:03.000Z\trun-1\t2\tcase-2\tabc\tmissingTestData\tapplication\tArchive an order\tNo orders are seeded.\tGET /api/orders returned an empty list.\tSeed an order for the test user.\tpass",
    ]);
    expect(mocks.logNotice).toHaveBeenCalledWith(
      "Setup blockers since 2026-09-20T00:00:00.000Z by category: missingTestData 1, testUserPermissions 0.",
    );
    expect(mocks.logNotice).toHaveBeenCalledWith(note);
  });

  it("prints the body without notes as --json", async () => {
    await run({ ...defaults, json: true });

    expect(logSpy.mock.calls).toEqual([[serializeJson(body)]]);
    expect(mocks.logNotice).toHaveBeenCalledWith(note);
  });

  it("hints at the project only for an unfiltered empty result", async () => {
    mocks.getAgentSwarmSetupBlockers.mockResolvedValue({
      ...body,
      setupBlockers: [],
    });

    await run(defaults);
    expect(mocks.logNotice).toHaveBeenCalledWith(
      "No Agent swarm setup blockers found for this project. (hint)",
    );

    await run({ ...defaults, category: "authentication" });
    expect(mocks.logNotice).toHaveBeenCalledWith(
      "No Agent swarm setup blockers matching the filters found for this project.",
    );
  });
});
