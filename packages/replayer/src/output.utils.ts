import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { BASE_SNIPPETS_URL } from "@alwaysmeticulous/common";
import {
  ReplayTimelineData,
  SessionData,
} from "@alwaysmeticulous/sdk-bundles-api";
import { CoverageEntry } from "puppeteer";
import { AssetSnapshotsData } from "./assets/assets.types";
import { snapshotAssets } from "./assets/snapshot-assets";
import { ReplayData, ReplayMetadata } from "./replay.types";

export interface WriteOutputOptions {
  outputDir: string;
  metadata: ReplayMetadata;
  sessionData: SessionData;
  replayData: ReplayData;
  coverageData: CoverageEntry[];
  timelineData: ReplayTimelineData;
}

export const writeOutput: (
  options: WriteOutputOptions
) => Promise<void> = async ({
  outputDir,
  metadata,
  sessionData,
  replayData,
  coverageData,
  timelineData,
}) => {
  const { playbackData, logs, assetSnapshotsData } = replayData;

  await mkdir(outputDir, { recursive: true });

  const writeMetadataPromise = writeMetadata({ outputDir, metadata });
  const writeAssetSnapshotsPromise = writeAssetSnapshots({
    outputDir,
    assetSnapshotsData,
  });
  const writeCoverageDataPromise = writeRawCoverageData({
    outputDir,
    coverageData,
  });
  const writeSessionDataPromise = writeSessionData({
    outputDir,
    sessionData,
  });
  const writePlaybackDataPromise = writePlaybackData({
    outputDir,
    playbackData,
  });
  const writeLogsPromise = writeLogs({ outputDir, logs });
  const writeTimelinePromise = writeTimeline({ outputDir, timelineData });

  await Promise.all([
    writeMetadataPromise,
    writeAssetSnapshotsPromise,
    writeCoverageDataPromise,
    writeSessionDataPromise,
    writePlaybackDataPromise,
    writeLogsPromise,
    writeTimelinePromise,
  ]);
};

const writeAssetSnapshots: (options: {
  outputDir: string;
  assetSnapshotsData: AssetSnapshotsData;
}) => Promise<void> = async ({ outputDir, assetSnapshotsData }) => {
  const assetsPath = join(outputDir, "snapshotted-assets");
  mkdir(assetsPath, {
    recursive: true,
  });
  return snapshotAssets({
    assetsPath,
    assetSnapshots: assetSnapshotsData.assetSnapshots,
    baseUrl: assetSnapshotsData.baseUrl,
  });
};

const writeRawCoverageData: (options: {
  outputDir: string;
  coverageData: CoverageEntry[];
}) => Promise<void> = async ({ outputDir, coverageData }) => {
  // We already snapshot the assets, so don't need to save the script contents
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const withoutScriptText = coverageData.map(({ text, ...rest }) => rest);
  const withoutMeticulousScriptCoverage = withoutScriptText.filter(
    ({ url }) => !isMeticulousSnippetURL(url)
  );
  await writeFile(
    join(outputDir, "raw-coverage.json"),
    JSON.stringify(withoutMeticulousScriptCoverage, null, 2),
    "utf-8"
  );
};

const isMeticulousSnippetURL = (url: string) => {
  try {
    return new URL(url).origin === new URL(BASE_SNIPPETS_URL).origin;
  } catch (_error) {
    // If not parsable as a URL then assume the executed code is not
    // from the Meticulous snippet
    return false;
  }
};

const writeMetadata: (options: {
  outputDir: string;
  metadata: ReplayMetadata;
}) => Promise<void> = async ({ outputDir, metadata }) => {
  await writeFile(
    join(outputDir, "metadata.json"),
    JSON.stringify(metadata, null, 2),
    "utf-8"
  );
};

const writeSessionData: (options: {
  outputDir: string;
  sessionData: SessionData;
}) => Promise<void> = async ({ outputDir, sessionData }) => {
  // We don't _need_ to save the session data, since it's immutable, and we
  // already store a pointer to the session id. However it's useful for faster
  // debugging so for now we save a copy of it anyway. Note however that we filter out
  // the rrwebEvents since the rrweb data size can be significant (in one case 4mb,
  // or 25% of total zip size).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { rrwebEvents, ...sessionDataWithoutRRWebEvents } = sessionData;

  await writeFile(
    join(outputDir, "session-data.json"),
    JSON.stringify(sessionDataWithoutRRWebEvents, null, 2),
    "utf-8"
  );
};

const writePlaybackData: (options: {
  outputDir: string;
  playbackData: ReplayData["playbackData"];
}) => Promise<void> = async ({ outputDir, playbackData }) => {
  playbackData.events.sort((a, b) => a.timestamp - b.timestamp);

  await writeFile(
    join(outputDir, "playback-data.json"),
    JSON.stringify(playbackData, null, 2),
    "utf-8"
  );
};

const writeLogs: (options: {
  outputDir: string;
  logs: ReplayData["logs"];
}) => Promise<void> = async ({ outputDir, logs }) => {
  await writeFile(
    join(outputDir, "logs.json"),
    JSON.stringify(logs, null, 2),
    "utf-8"
  );
};

const writeTimeline: (options: {
  outputDir: string;
  timelineData: ReplayTimelineData;
}) => Promise<void> = async ({ outputDir, timelineData }) => {
  await writeFile(
    join(outputDir, "timeline.json"),
    JSON.stringify(timelineData, null, 2),
    "utf-8"
  );
};

export const prepareScreenshotsDir = async (
  outputDir: string
): Promise<string> => {
  const dirName = join(outputDir, "screenshots");
  await mkdir(dirName, { recursive: true });
  return dirName;
};
