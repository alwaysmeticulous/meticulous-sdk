import type { TestRun } from "@alwaysmeticulous/api";
import {
  getTestRun,
  getTestRunNetworkPatchingResult,
  markTestRunExpectsCustomChecks,
  type MeticulousClient,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  fetchEffectiveTestRunOrFallback,
  findTestRunForCustomChecks,
  resolveEffectiveTestRunId,
  type WaitClock,
} from "../wait-for-test-run";

vi.mock("@alwaysmeticulous/client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@alwaysmeticulous/client")>();
  return {
    ...actual,
    getTestRun: vi.fn(),
    getTestRunNetworkPatchingResult: vi.fn(),
    markTestRunExpectsCustomChecks: vi.fn(),
  };
});

const ORIGINAL = "test-run-A";
const MERGED = "test-run-C";
const TIMEOUT_MS = 100;
const POLL_MS = 10;

// Fake clock that advances virtual time whenever the code sleeps, so the
// poll/timeout logic runs deterministically without real timers.
const makeClock = (): WaitClock => {
  let current = 0;
  return {
    now: () => current,
    sleep: vi.fn(async (ms: number) => {
      current += ms;
    }),
  };
};

const phase = (clock: WaitClock) => ({
  client: {} as MeticulousClient,
  testRunId: ORIGINAL,
  pollIntervalMs: POLL_MS,
  timeoutMs: TIMEOUT_MS,
  startTime: 0,
  logger: initLogger(),
  clock,
});

const testRunFixture = (id: string): TestRun =>
  ({ id, status: "Success" }) as TestRun;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveEffectiveTestRunId", () => {
  it("returns the original run when the endpoint is unavailable (404 → null)", async () => {
    (getTestRunNetworkPatchingResult as Mock).mockResolvedValue(null);

    await expect(resolveEffectiveTestRunId(phase(makeClock()))).resolves.toBe(
      ORIGINAL,
    );
    expect(getTestRunNetworkPatchingResult).toHaveBeenCalledTimes(1);
  });

  it("returns the merged run id once patching has settled", async () => {
    (getTestRunNetworkPatchingResult as Mock).mockResolvedValue({
      effectiveTestRunId: MERGED,
      isNetworkPatchingInProgress: false,
    });

    await expect(resolveEffectiveTestRunId(phase(makeClock()))).resolves.toBe(
      MERGED,
    );
  });

  it("keeps polling while patching is in progress, then returns the merged run", async () => {
    (getTestRunNetworkPatchingResult as Mock)
      .mockResolvedValueOnce({
        effectiveTestRunId: ORIGINAL,
        isNetworkPatchingInProgress: true,
      })
      .mockResolvedValueOnce({
        effectiveTestRunId: ORIGINAL,
        isNetworkPatchingInProgress: true,
      })
      .mockResolvedValue({
        effectiveTestRunId: MERGED,
        isNetworkPatchingInProgress: false,
      });

    await expect(resolveEffectiveTestRunId(phase(makeClock()))).resolves.toBe(
      MERGED,
    );
    expect(getTestRunNetworkPatchingResult).toHaveBeenCalledTimes(3);
  });

  it("returns the best-known effective id if patching never settles before the timeout", async () => {
    (getTestRunNetworkPatchingResult as Mock).mockResolvedValue({
      effectiveTestRunId: MERGED,
      isNetworkPatchingInProgress: true,
    });

    await expect(resolveEffectiveTestRunId(phase(makeClock()))).resolves.toBe(
      MERGED,
    );
  });

  it("retries transient errors and then succeeds", async () => {
    (getTestRunNetworkPatchingResult as Mock)
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue({
        effectiveTestRunId: MERGED,
        isNetworkPatchingInProgress: false,
      });

    await expect(resolveEffectiveTestRunId(phase(makeClock()))).resolves.toBe(
      MERGED,
    );
    expect(getTestRunNetworkPatchingResult).toHaveBeenCalledTimes(2);
  });

  it("falls back to the original run if transient errors persist past the timeout", async () => {
    (getTestRunNetworkPatchingResult as Mock).mockRejectedValue(
      new Error("persistent"),
    );

    await expect(resolveEffectiveTestRunId(phase(makeClock()))).resolves.toBe(
      ORIGINAL,
    );
  });
});

describe("fetchEffectiveTestRunOrFallback", () => {
  it("returns the fetched merged run on success", async () => {
    (getTestRun as Mock).mockResolvedValue(testRunFixture(MERGED));

    const original = testRunFixture(ORIGINAL);
    await expect(
      fetchEffectiveTestRunOrFallback(phase(makeClock()), MERGED, original),
    ).resolves.toEqual({ testRunId: MERGED, testRun: testRunFixture(MERGED) });
  });

  it("falls back to the original run if the merged run can't be fetched before the timeout", async () => {
    (getTestRun as Mock).mockRejectedValue(new Error("nope"));

    const original = testRunFixture(ORIGINAL);
    await expect(
      fetchEffectiveTestRunOrFallback(phase(makeClock()), MERGED, original),
    ).resolves.toEqual({ testRunId: ORIGINAL, testRun: original });
  });
});

describe("findTestRunForCustomChecks", () => {
  const client = {} as MeticulousClient;

  it("registers the original run as expecting custom checks when no patching applies", async () => {
    (getTestRun as Mock).mockResolvedValue(testRunFixture(ORIGINAL));
    (getTestRunNetworkPatchingResult as Mock).mockResolvedValue({
      effectiveTestRunId: ORIGINAL,
      isNetworkPatchingInProgress: false,
    });

    const result = await findTestRunForCustomChecks({
      client,
      testRunId: ORIGINAL,
    });

    expect(result).toEqual({
      testRunId: ORIGINAL,
      testRun: testRunFixture(ORIGINAL),
    });
    expect(markTestRunExpectsCustomChecks).toHaveBeenCalledWith({
      client,
      testRunId: ORIGINAL,
    });
  });

  it("registers the merged run (not the original) when network patching applied", async () => {
    (getTestRun as Mock)
      .mockResolvedValueOnce(testRunFixture(ORIGINAL))
      .mockResolvedValueOnce(testRunFixture(MERGED));
    (getTestRunNetworkPatchingResult as Mock).mockResolvedValue({
      effectiveTestRunId: MERGED,
      isNetworkPatchingInProgress: false,
    });

    const result = await findTestRunForCustomChecks({
      client,
      testRunId: ORIGINAL,
    });

    expect(result).toEqual({
      testRunId: MERGED,
      testRun: testRunFixture(MERGED),
    });
    expect(markTestRunExpectsCustomChecks).toHaveBeenCalledWith({
      client,
      testRunId: MERGED,
    });
  });

  it("does not fail the wait if registering the expectation throws", async () => {
    (getTestRun as Mock).mockResolvedValue(testRunFixture(ORIGINAL));
    (getTestRunNetworkPatchingResult as Mock).mockResolvedValue({
      effectiveTestRunId: ORIGINAL,
      isNetworkPatchingInProgress: false,
    });
    (markTestRunExpectsCustomChecks as Mock).mockRejectedValue(
      new Error("expect endpoint down"),
    );

    await expect(
      findTestRunForCustomChecks({ client, testRunId: ORIGINAL }),
    ).resolves.toEqual({
      testRunId: ORIGINAL,
      testRun: testRunFixture(ORIGINAL),
    });
  });

  it("does not register the expectation when skipRegisteringExpectedCustomChecks is set", async () => {
    (getTestRun as Mock).mockResolvedValue(testRunFixture(ORIGINAL));
    (getTestRunNetworkPatchingResult as Mock).mockResolvedValue({
      effectiveTestRunId: ORIGINAL,
      isNetworkPatchingInProgress: false,
    });

    const result = await findTestRunForCustomChecks({
      client,
      testRunId: ORIGINAL,
      skipRegisteringExpectedCustomChecks: true,
    });

    expect(result).toEqual({
      testRunId: ORIGINAL,
      testRun: testRunFixture(ORIGINAL),
    });
    expect(markTestRunExpectsCustomChecks).not.toHaveBeenCalled();
  });
});
