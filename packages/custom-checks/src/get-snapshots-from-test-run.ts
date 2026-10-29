import type { Snapshot } from "@alwaysmeticulous/api";
import {
  maybeEnrichFetchError,
  type MeticulousClient,
} from "@alwaysmeticulous/client";
import {
  downloadAndAssembleSnapshots,
  type CustomCheckSnapshotFileToDownload,
} from "./download-snapshots";

export interface GetSnapshotsFromTestRunOptions {
  client: MeticulousClient;
  testRunId: string;
  /** The custom check snapshot types to fetch, e.g. ["network-requests"]. */
  snapshotTypes: string[];
  /**
   * When true, only downloads base snapshot files whose session also produced a
   * head snapshot file (matched by {@link sessionComparisonKey}, so two
   * network-repair generations of the same recording still pair).
   *
   * Checks that only compare per-session pairs (`network-requests`,
   * `react-component-renders`) discard base-only sessions immediately; on a PR
   * run where RSE executed a small subset of a large base pool, skipping the
   * unexecuted base sessions avoids downloading and holding thousands of unused
   * base snapshot files in memory. Leave false (the default) for checks that
   * index the whole base run (e.g. `accessibility`'s run-wide reference
   * identities) or for custom checks whose comparison scope is caller-defined.
   */
  onlyBaseSessionsPresentInHead?: boolean;
  /**
   * When true, skips downloading `baseSnapshotFiles` altogether if
   * `headSnapshotFiles` is empty.
   *
   * Even checks that index the whole base run (`accessibility`,
   * `console-errors`) only report regressions observed on head, so when the
   * head run produced no snapshots of the requested types there is nothing to
   * verify against the base run. Leave false (the default) for custom checks
   * that may inspect `baseSnapshots` even when `headSnapshots` is empty.
   */
  skipBaseWhenHeadEmpty?: boolean;
}

export interface SnapshotsFromTestRun {
  testRunId: string;
  /** The base test run the snapshots were compared against. */
  baseTestRunId: string;
  baseSnapshots: Snapshot[];
  headSnapshots: Snapshot[];
}

/**
 * Response of `GET test-runs/:testRunId/custom-check-snapshots-download-urls`:
 * a single signed base URL plus the list of snapshot files to download for the
 * head test run and its resolved base. Mirrors the backend's
 * `TestRunCustomCheckSnapshotDownloadUrlsResponse`.
 */
interface SnapshotDownloadUrlsResponse {
  testRunId: string;
  baseTestRunId: string;
  signedBaseUrl: string;
  baseSnapshotFiles: CustomCheckSnapshotFileToDownload[];
  headSnapshotFiles: CustomCheckSnapshotFileToDownload[];
}

/**
 * Matches a `_p<timestamp>` patched-session segment anywhere in a session id.
 *
 * A repaired session's id carries `_p<epochMs>` from when the repair ran, so
 * the base run and the head run routinely replay the same recording under
 * different `_p<timestamp>` suffixes. Slice (`_sl<number>`) and mutation
 * (`_mut<hash>`) suffixes identify distinct sessions and are preserved. Not
 * anchored at the end because synthetic suffixes can follow a patch segment
 * (e.g. `..._p<timestamp>_mut<hash>`).
 */
const PATCHED_SUFFIX_ANYWHERE_REGEX = /_p\d{13}/g;

/**
 * The identity two replays of the same recording share across network-repair
 * generations.
 */
export const sessionComparisonKey = (sessionId: string): string =>
  sessionId.replace(PATCHED_SUFFIX_ANYWHERE_REGEX, "");

/**
 * Filters `baseSnapshotFiles` to sessions that also appear in
 * `headSnapshotFiles`, aligned by {@link sessionComparisonKey}.
 */
export const filterBaseSnapshotFilesToHeadSessions = ({
  baseSnapshotFiles,
  headSnapshotFiles,
}: {
  baseSnapshotFiles: readonly CustomCheckSnapshotFileToDownload[];
  headSnapshotFiles: readonly CustomCheckSnapshotFileToDownload[];
}): CustomCheckSnapshotFileToDownload[] => {
  const headSessionKeys = new Set(
    headSnapshotFiles.map((file) => sessionComparisonKey(file.sessionId)),
  );
  return baseSnapshotFiles.filter((file) =>
    headSessionKeys.has(sessionComparisonKey(file.sessionId)),
  );
};

/**
 * Fetches the custom check snapshots gathered during the base and head replays
 * of a test run, ready to be passed to a custom check's `execute`. Throws if the
 * test run has no resolvable base test run.
 *
 * The backend returns one signed URL and the list of files; we download and
 * assemble them here, one side at a time. A full-size run's base and head file
 * lists are each already large enough on their own (the caller downloads one
 * snapshot type at a time for the same reason); downloading both sides
 * concurrently doubles the peak concurrent connections against the snapshot
 * store and the peak memory held during assembly, which is what has been
 * tipping the largest runs into S3 slow-down (503) responses and worker OOMs.
 */
export const getSnapshotsFromTestRun = async ({
  client,
  testRunId,
  snapshotTypes,
  onlyBaseSessionsPresentInHead = false,
  skipBaseWhenHeadEmpty = false,
}: GetSnapshotsFromTestRunOptions): Promise<SnapshotsFromTestRun> => {
  const params = new URLSearchParams();
  for (const snapshotType of snapshotTypes) {
    params.append("snapshotTypes", snapshotType);
  }
  const { data } = await client
    .get<SnapshotDownloadUrlsResponse>(
      `test-runs/${testRunId}/custom-check-snapshots-download-urls?${params.toString()}`,
    )
    .catch((error) => {
      throw maybeEnrichFetchError(error);
    });

  const baseFilesToDownload =
    skipBaseWhenHeadEmpty && data.headSnapshotFiles.length === 0
      ? []
      : onlyBaseSessionsPresentInHead
        ? filterBaseSnapshotFilesToHeadSessions({
            baseSnapshotFiles: data.baseSnapshotFiles,
            headSnapshotFiles: data.headSnapshotFiles,
          })
        : data.baseSnapshotFiles;

  const baseSnapshots = await downloadAndAssembleSnapshots({
    signedBaseUrl: data.signedBaseUrl,
    files: baseFilesToDownload,
  });
  const headSnapshots = await downloadAndAssembleSnapshots({
    signedBaseUrl: data.signedBaseUrl,
    files: data.headSnapshotFiles,
  });

  return {
    testRunId: data.testRunId,
    baseTestRunId: data.baseTestRunId,
    baseSnapshots,
    headSnapshots,
  };
};
