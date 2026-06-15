import type {
  ReportCustomCheckResultsRequest,
  TestRun,
  TestRunStatus,
} from "@alwaysmeticulous/api";
import type { MeticulousClient } from "@alwaysmeticulous/client";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { downloadAndAssembleSnapshots } from "../download-snapshots";
import { getSnapshotsFromTestRun } from "../get-snapshots-from-test-run";
import { reportCustomCheckResults } from "../report-custom-check-results";
import {
  findTestRunByCommitAndWaitForCompletion,
  findTestRunForCustomChecks,
} from "../wait-for-test-run";

// Stub the download/assemble step so this suite stays a pure unit test of the
// orchestration: it asserts the right endpoint is called and the downloaded
// snapshots are wired through. The download module is covered separately in
// download-snapshots.spec.ts.
vi.mock("../download-snapshots", () => ({
  downloadAndAssembleSnapshots: vi.fn(),
}));

const testRun = (id: string, status: TestRunStatus): TestRun =>
  ({ id, status }) as unknown as TestRun;

describe("custom checks SDK helpers", () => {
  let client: { get: Mock; post: Mock; put: Mock };
  const asClient = (): MeticulousClient =>
    client as unknown as MeticulousClient;

  beforeEach(() => {
    client = { get: vi.fn(), post: vi.fn(), put: vi.fn() };
  });

  describe("reportCustomCheckResults", () => {
    it("POSTs the results to the custom-check-results endpoint", async () => {
      client.post.mockResolvedValue({ data: { reported: true } });
      const results: ReportCustomCheckResultsRequest = {
        status: "complete",
        checks: [
          {
            checkId: "network-requests-diff",
            verdict: "warn-without-requiring-user-ack",
            summary: "1 session changed",
            report: { type: "markdown", markdown: "# Report" },
          },
        ],
      };

      await reportCustomCheckResults({
        client: asClient(),
        testRunId: "tr-1",
        results,
      });

      expect(client.post).toHaveBeenCalledWith(
        "test-runs/tr-1/custom-check-results",
        results,
      );
    });

    it("reports a run-level execution error", async () => {
      client.post.mockResolvedValue({ data: { reported: true } });
      const results: ReportCustomCheckResultsRequest = {
        status: "execution-error",
        error: "boom",
      };

      await reportCustomCheckResults({
        client: asClient(),
        testRunId: "tr-1",
        results,
      });

      expect(client.post).toHaveBeenCalledWith(
        "test-runs/tr-1/custom-check-results",
        { status: "execution-error", error: "boom" },
      );
    });
  });

  describe("getSnapshotsFromTestRun", () => {
    it("fetches the download urls then downloads and assembles base + head snapshots", async () => {
      const response = {
        testRunId: "tr-1",
        baseTestRunId: "base-1",
        signedBaseUrl: "https://cf.example/?Signature=sig&Key-Pair-Id=k",
        baseSnapshotFiles: [
          {
            type: "network-requests",
            sessionId: "sess-base",
            key: "proj/replay-base/custom-checks-snapshots/network-requests.json.gz",
          },
        ],
        headSnapshotFiles: [
          {
            type: "network-requests",
            sessionId: "sess-head",
            key: "proj/replay-head/custom-checks-snapshots/network-requests.json.gz",
          },
        ],
      };
      client.get.mockResolvedValue({ data: response });

      const baseSnapshots = [
        {
          type: "network-requests",
          sessionId: "sess-base",
          stageDuringSession: "final-state",
          data: { count: 1 },
        },
      ];
      const headSnapshots = [
        {
          type: "network-requests",
          sessionId: "sess-head",
          stageDuringSession: "final-state",
          data: { count: 2 },
        },
      ];
      // Return base vs head snapshots by which file list was passed (the same
      // array references the response holds), proving each side is assembled
      // from its own files.
      (downloadAndAssembleSnapshots as Mock).mockImplementation(
        async ({ files }: { files: unknown }) =>
          files === response.baseSnapshotFiles ? baseSnapshots : headSnapshots,
      );

      const result = await getSnapshotsFromTestRun({
        client: asClient(),
        testRunId: "tr-1",
        snapshotTypes: ["network-requests"],
      });

      expect(client.get).toHaveBeenCalledWith(
        "test-runs/tr-1/custom-check-snapshots-download-urls?snapshotTypes=network-requests",
      );
      expect(downloadAndAssembleSnapshots).toHaveBeenCalledWith({
        signedBaseUrl: response.signedBaseUrl,
        files: response.baseSnapshotFiles,
      });
      expect(downloadAndAssembleSnapshots).toHaveBeenCalledWith({
        signedBaseUrl: response.signedBaseUrl,
        files: response.headSnapshotFiles,
      });
      expect(result).toEqual({
        testRunId: "tr-1",
        baseTestRunId: "base-1",
        baseSnapshots,
        headSnapshots,
      });
    });
  });

  describe("findTestRunForCustomChecks", () => {
    // After the run reaches a terminal status the wait resolves the "effective"
    // test run via the network-patching-result endpoint. These tests have no
    // patching, so it reports the original run as not-in-progress.
    const noNetworkPatching = (id: string) => ({
      data: { effectiveTestRunId: id, isNetworkPatchingInProgress: false },
    });

    it("polls until the test run reaches a terminal status", async () => {
      const statuses: TestRunStatus[] = [
        "Running",
        "PostProcessing",
        "Success",
      ];
      let statusCalls = 0;
      client.get.mockImplementation(async (url: string) => {
        if (url.endsWith("/network-patching-result")) {
          return noNetworkPatching("tr-1");
        }
        const status = statuses[Math.min(statusCalls, statuses.length - 1)];
        statusCalls += 1;
        return { data: testRun("tr-1", status) };
      });

      const result = await findTestRunForCustomChecks({
        client: asClient(),
        testRunId: "tr-1",
        pollIntervalMs: 1,
      });

      expect(result.testRun.status).toBe("Success");
      expect(result.testRunId).toBe("tr-1");
      expect(statusCalls).toBe(3);
    });

    it("returns when a run leaves the in-progress states (e.g. Partial), not only on Success/Failure", async () => {
      const statuses: TestRunStatus[] = ["Running", "Partial"];
      let statusCalls = 0;
      client.get.mockImplementation(async (url: string) => {
        if (url.endsWith("/network-patching-result")) {
          return noNetworkPatching("tr-1");
        }
        const status = statuses[Math.min(statusCalls, statuses.length - 1)];
        statusCalls += 1;
        return { data: testRun("tr-1", status) };
      });

      const result = await findTestRunForCustomChecks({
        client: asClient(),
        testRunId: "tr-1",
        pollIntervalMs: 1,
      });

      expect(result.testRun.status).toBe("Partial");
      expect(statusCalls).toBe(2);
    });

    it("throws once the timeout elapses", async () => {
      client.get.mockResolvedValue({ data: testRun("tr-1", "Running") });

      await expect(
        findTestRunForCustomChecks({
          client: asClient(),
          testRunId: "tr-1",
          pollIntervalMs: 1,
          timeoutMs: 0,
        }),
      ).rejects.toThrow(/Timed out/);
    });
  });

  describe("findTestRunByCommitAndWaitForCompletion", () => {
    it("resolves the latest run for the commit, then waits for it to complete", async () => {
      client.get.mockImplementation(async (url: string) => {
        if (url === "test-runs/cache") {
          return { data: testRun("tr-9", "Running") };
        }
        if (url.endsWith("/network-patching-result")) {
          return {
            data: {
              effectiveTestRunId: "tr-9",
              isNetworkPatchingInProgress: false,
            },
          };
        }
        return { data: testRun("tr-9", "Success") };
      });

      const result = await findTestRunByCommitAndWaitForCompletion({
        client: asClient(),
        commitSha: "abc123",
        pollIntervalMs: 1,
      });

      expect(result.testRunId).toBe("tr-9");
      expect(result.testRun.status).toBe("Success");
    });

    it("throws when no test run exists for the commit", async () => {
      // The cache endpoint yields no run (getLatestTestRunResults returns null).
      client.get.mockResolvedValue({ data: null });

      await expect(
        findTestRunByCommitAndWaitForCompletion({
          client: asClient(),
          commitSha: "missing",
        }),
      ).rejects.toThrow(/No test run found for commit missing/);
    });
  });
});
