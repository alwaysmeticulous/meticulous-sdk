import type {
  ReportCustomCheckResultsRequest,
  TestRun,
  TestRunStatus,
} from "@alwaysmeticulous/api";
import type { MeticulousClient } from "@alwaysmeticulous/client";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { getSnapshotsFromTestRun } from "../get-snapshots-from-test-run";
import { reportCustomCheckResults } from "../report-custom-check-results";
import {
  findTestRunByCommitAndWaitForCompletion,
  findTestRunByIdAndWaitForCompletion,
} from "../wait-for-test-run";

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
            verdict: "warn",
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
    it("fetches snapshots for the requested types", async () => {
      const response = {
        testRunId: "tr-1",
        baseTestRunId: "base-1",
        baseSnapshots: [],
        headSnapshots: [],
      };
      client.get.mockResolvedValue({ data: response });

      const result = await getSnapshotsFromTestRun({
        client: asClient(),
        testRunId: "tr-1",
        snapshotTypes: ["network-requests"],
      });

      expect(result).toEqual(response);
      expect(client.get).toHaveBeenCalledWith(
        "test-runs/tr-1/custom-check-snapshots?snapshotTypes=network-requests",
      );
    });
  });

  describe("findTestRunByIdAndWaitForCompletion", () => {
    it("polls until the test run reaches a terminal status", async () => {
      client.get
        .mockResolvedValueOnce({ data: testRun("tr-1", "Running") })
        .mockResolvedValueOnce({ data: testRun("tr-1", "PostProcessing") })
        .mockResolvedValueOnce({ data: testRun("tr-1", "Success") });

      const result = await findTestRunByIdAndWaitForCompletion({
        client: asClient(),
        testRunId: "tr-1",
        pollIntervalMs: 1,
      });

      expect(result.testRun.status).toBe("Success");
      expect(client.get).toHaveBeenCalledTimes(3);
    });

    it("returns when a run leaves the in-progress states (e.g. Partial), not only on Success/Failure", async () => {
      client.get
        .mockResolvedValueOnce({ data: testRun("tr-1", "Running") })
        .mockResolvedValueOnce({ data: testRun("tr-1", "Partial") });

      const result = await findTestRunByIdAndWaitForCompletion({
        client: asClient(),
        testRunId: "tr-1",
        pollIntervalMs: 1,
      });

      expect(result.testRun.status).toBe("Partial");
      expect(client.get).toHaveBeenCalledTimes(2);
    });

    it("throws once the timeout elapses", async () => {
      client.get.mockResolvedValue({ data: testRun("tr-1", "Running") });

      await expect(
        findTestRunByIdAndWaitForCompletion({
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
      client.get.mockImplementation(async (url: string) =>
        url === "test-runs/cache"
          ? { data: testRun("tr-9", "Running") }
          : { data: testRun("tr-9", "Success") },
      );

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
