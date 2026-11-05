import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type {
  FileWithCompactRanges,
  MeticulousClient,
} from "@alwaysmeticulous/client";
import {
  getReplayDiffJsCoverage,
  isTestRunProcessingResponse,
} from "@alwaysmeticulous/client";
import chalk from "chalk";
import pLimit from "p-limit";
import { DEBUG_DATA_DIRECTORY } from "./debug-constants";
import type { DebugContext } from "./debug.types";
import type { LineRange } from "./line-ranges";
import type { ScreenshotIdentifier } from "./screenshot-identifier";
import {
  screenshotIdentifierToBackendName,
  screenshotIdentifierToFilename,
} from "./screenshot-identifier";

const POLL_INTERVAL_MS = 10_000;
const POLL_TIMEOUT_MS = 3 * 60_000;
const DEFAULT_MAX_CONCURRENCY = 8;

/** Executed line ranges per repo-relative path. */
export type RepoCoverage = Map<string, LineRange[]>;

export type RepoCoverageResult =
  | { kind: "available"; head: RepoCoverage; base: RepoCoverage }
  | { kind: "unavailable"; reason: string };

/** Per `<headReplayId>-vs-<baseReplayId>` label. */
export interface RepoCoverageByPair {
  [label: string]:
    | {
        wholeReplay: RepoCoverageResult;
        /** Only when a screenshot is targeted. */
        screenshot: RepoCoverageResult | null;
      }
    | undefined;
}

export interface FetchRepoCoverageOptions {
  client: MeticulousClient;
  debugContext: DebugContext;
  workspaceDir: string;
  maxConcurrency?: number | undefined;
  /** Injectable for tests. */
  fetchCoverage?: typeof getReplayDiffJsCoverage | undefined;
  pollIntervalMs?: number | undefined;
  pollTimeoutMs?: number | undefined;
}

/**
 * Fetches each replay diff's head and base coverage keyed by repo path, as
 * Meticulous's coverage pipeline maps source-map paths to repo files, for the
 * whole replay and the targeted screenshot, for `coverage-diff/`. Coverage
 * it can't fetch, or that is still being computed after the timeout, is
 * reported as unavailable with the reason.
 */
export const fetchRepoCoverage = async ({
  client,
  debugContext,
  workspaceDir,
  maxConcurrency = DEFAULT_MAX_CONCURRENCY,
  fetchCoverage = getReplayDiffJsCoverage,
  pollIntervalMs = POLL_INTERVAL_MS,
  pollTimeoutMs = POLL_TIMEOUT_MS,
}: FetchRepoCoverageOptions): Promise<RepoCoverageByPair> => {
  const fetchPair = async (
    replayDiffId: string,
    label: string,
    screenshotName: string | undefined,
  ): Promise<RepoCoverageResult> => {
    const scope = screenshotName ?? "whole replay";
    try {
      const deadline = Date.now() + pollTimeoutMs;
      let response = await fetchCoverage(client, replayDiffId, screenshotName, {
        limit: 1,
      });
      while (isTestRunProcessingResponse(response)) {
        if (Date.now() >= deadline) {
          const reason = `still being computed after ${pollTimeoutMs / 1000}s`;
          console.warn(
            chalk.yellow(
              `  Warning: Coverage for ${label} (${scope}) ${reason}`,
            ),
          );
          return { kind: "unavailable", reason };
        }
        await sleep(pollIntervalMs);
        response = await fetchCoverage(client, replayDiffId, screenshotName, {
          limit: 1,
        });
      }
      if (response.head == null || response.base == null) {
        return {
          kind: "unavailable",
          reason: "no coverage was recorded for at least one side",
        };
      }
      const emptyReason = findEmptyCoverageReason(
        response.head.length === 0,
        response.base.length === 0,
        screenshotName == null,
      );
      if (emptyReason != null) {
        return { kind: "unavailable", reason: emptyReason };
      }
      return {
        kind: "available",
        head: toRepoCoverage(response.head),
        base: toRepoCoverage(response.base),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        chalk.yellow(
          `  Warning: Could not fetch coverage for ${label} (${scope}): ${message}`,
        ),
      );
      return { kind: "unavailable", reason: message };
    }
  };

  const limit = pLimit(maxConcurrency);
  const entries = await Promise.all(
    debugContext.replayDiffs.map(async (diff) => {
      const label = `${diff.headReplayId}-vs-${diff.baseReplayId}`;
      // The backend resolves other name forms (e.g. without `.png`) itself.
      const screenshotName = debugContext.screenshot
        ? (findBackendScreenshotName(
            workspaceDir,
            diff.id,
            debugContext.screenshot,
          ) ?? debugContext.screenshot)
        : undefined;
      const [wholeReplay, screenshot] = await Promise.all([
        limit(() => fetchPair(diff.id, label, undefined)),
        screenshotName != null
          ? limit(() => fetchPair(diff.id, label, screenshotName))
          : Promise.resolve(null),
      ]);
      return [label, { wholeReplay, screenshot }] as const;
    }),
  );
  return Object.fromEntries(entries);
};

/**
 * Coverage that maps to no repo file on either side, or on one side of the
 * whole replay (which always runs app code), means the source maps couldn't
 * be mapped to the repo rather than that no code ran. A single screenshot's
 * coverage can legitimately be empty on one side.
 */
const findEmptyCoverageReason = (
  headEmpty: boolean,
  baseEmpty: boolean,
  isWholeReplay: boolean,
): string | null => {
  if (headEmpty && baseEmpty) {
    return "no repo-mapped coverage was recorded for either replay";
  }
  if (isWholeReplay && (headEmpty || baseEmpty)) {
    return `no repo-mapped coverage was recorded for the ${headEmpty ? "head" : "base"} replay`;
  }
  return null;
};

const toRepoCoverage = (files: FileWithCompactRanges[]): RepoCoverage =>
  new Map(
    files.map(([path, ranges]) => [
      path.replace(/^\//, ""),
      ranges as LineRange[],
    ]),
  );

/**
 * The backend's name for the targeted screenshot (e.g. `after-event-552` for
 * `screenshot-after-event-00552.png`), from the replay diff's screenshot
 * results, which carry each screenshot's identifier.
 */
const findBackendScreenshotName = (
  workspaceDir: string,
  replayDiffId: string,
  screenshotFilename: string,
): string | undefined => {
  const diffPath = join(
    workspaceDir,
    DEBUG_DATA_DIRECTORY,
    "diffs",
    `${replayDiffId}.json`,
  );
  if (!existsSync(diffPath)) {
    return undefined;
  }
  try {
    const raw = JSON.parse(readFileSync(diffPath, "utf8")) as {
      data?: {
        screenshotDiffResults?: Array<{ identifier?: ScreenshotIdentifier }>;
      };
    };
    const identifier = (raw.data?.screenshotDiffResults ?? [])
      .map((result) => result.identifier)
      .find(
        (candidate) =>
          candidate != null &&
          screenshotIdentifierToFilename(candidate) === screenshotFilename,
      );
    return identifier != null
      ? (screenshotIdentifierToBackendName(identifier) ?? undefined)
      : undefined;
  } catch {
    return undefined;
  }
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
