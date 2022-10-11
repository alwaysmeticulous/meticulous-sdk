import { SessionData } from "@alwaysmeticulous/common";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { ReplayData, ReplayMetadata } from "./replay.types";
import { ReplayTimelineData } from "./timeline/timeline.types";
import { CoverageEntry } from "puppeteer";
import { AssetSnapshotsData } from "./assets/assets.types";
import { snapshotAssets } from "./assets/snapshot-assets";

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
  const writeSessionDataPromise = writeSessionData({ outputDir, sessionData });
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
}) => Promise<void[]> = async ({ outputDir, assetSnapshotsData }) => {
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
  await writeFile(
    join(outputDir, "raw-coverage.json"),
    JSON.stringify(coverageData, null, 2),
    "utf-8"
  );
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
  await writeFile(
    join(outputDir, "session-data.json"),
    JSON.stringify(sessionData, null, 2),
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

export const prepareScreenshotsDir: (
  outputDir: string
) => Promise<void> = async (outputDir) => {
  await mkdir(join(outputDir, "screenshots"), { recursive: true });
};
