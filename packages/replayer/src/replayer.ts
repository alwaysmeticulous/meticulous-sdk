import {
  METICULOUS_LOGGER_NAME,
  ReplayEventsFn,
  SessionData,
} from "@alwaysmeticulous/common";
import {
  OnReplayTimelineEventFn,
  ReplayTimelineEntry,
  ReplayUserInteractionsFn,
} from "@alwaysmeticulous/sdk-bundles-api";
import { StoryboardOptions } from "@alwaysmeticulous/sdk-bundles-api/dist/replay/sdk-to-bundle";
import log, { LogLevelDesc } from "loglevel";
import { DateTime } from "luxon";
import { Browser, launch, Page } from "puppeteer";
import { prepareScreenshotsDir, writeOutput } from "./output.utils";
import { ReplayMetadata } from "./replay.types";
import {
  createReplayPage,
  getRrwebRecordingDuration,
  getStartingViewport,
  getStartUrl,
  initializeReplayData,
} from "./replay.utils";
import { takeScreenshot } from "./screenshot.utils";
import { ReplayTimelineCollector } from "./timeline/collector";

export const replayEvents: ReplayEventsFn = async (options) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  const logLevel: LogLevelDesc = logger.getLevel();

  logger.debug(options);

  const {
    appUrl,
    browser: browser_,
    outputDir,
    session,
    sessionData,
    replayExecutionOptions,
    dependencies,
    screenshottingOptions,
    generatedBy
  } = options;

  // Extract replay metadata
  const {
    headless,
    devTools,
    shiftTime,
    networkStubbing,
    skipPauses,
    padTime,
    maxDurationMs,
    maxEventCount,
  } = replayExecutionOptions;
  const metadata: ReplayMetadata = {
    session,
    options: {
      appUrl,
      outputDir,
      dependencies,
      ...replayExecutionOptions,
    },
    generatedBy,
  };

  const defaultViewport = getStartingViewport(sessionData);
  const windowWidth = defaultViewport.width + 20;
  const windowHeight = defaultViewport.height + 200;
  const browser: Browser =
    browser_ ||
    (await launch({
      defaultViewport: defaultViewport,
      args: [
        `--window-size=${windowWidth},${windowHeight}`,
        // This disables cross-origin security. We need this in order to disable CORS for replayed network requests,
        // including the respective Preflgiht CORS requests which are not handled by the network stubbing layer.
        "--disable-web-security",
      ],
      headless: headless,
      devtools: devTools,
    }));

  const context = await browser.createIncognitoBrowserContext();
  (await browser.defaultBrowserContext().pages()).forEach((page) =>
    page.close().catch((error) => {
      logger.error(error);
    })
  );

  const timelineCollector = new ReplayTimelineCollector();
  const onTimelineEvent: OnReplayTimelineEventFn = (
    entry: ReplayTimelineEntry
  ) => timelineCollector.addEntry(entry);

  const page = await createReplayPage({
    context,
    defaultViewport,
    sessionData,
    shiftTime,
    dependencies,
    onTimelineEvent,
  });

  // Calculate start URL based on the one that the session originated on/from.
  const startUrl = getStartUrl({ session, sessionData, appUrl });

  const replayData = await initializeReplayData({ page, startUrl });

  // Set-up network stubbing if required
  if (networkStubbing) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const networkStubbingModule = require(dependencies.nodeNetworkStubbing
      .location);
    const setupReplayNetworkStubbing =
      networkStubbingModule.setupReplayNetworkStubbing as (options: {
        page: Page;
        logLevel: LogLevelDesc;
        sessionData: SessionData;
        startUrl: string;
        onTimelineEvent: OnReplayTimelineEventFn;
      }) => Promise<void>;
    await setupReplayNetworkStubbing({
      page,
      logLevel,
      sessionData,
      startUrl,
      onTimelineEvent,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const browserContextModule = require(dependencies.nodeBrowserContext
    .location);
  const setupBrowserContextSeeding =
    browserContextModule.setupBrowserContextSeeding as (options: {
      page: Page;
      sessionData: SessionData;
      startUrl: string;
    }) => Promise<void>;
  await setupBrowserContextSeeding({
    page,
    sessionData,
    startUrl,
  });

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const userInteractionsModule = require(dependencies.nodeUserInteractions
    .location);
  const replayUserInteractions =
    userInteractionsModule.replayUserInteractions as ReplayUserInteractionsFn;

  // Navigate to the start URL.
  logger.debug(`Navigating to ${startUrl}`);
  const res = await page.goto(startUrl, {
    waitUntil: "domcontentloaded",
  });
  const status = res && res.status();

  if (status !== 200) {
    throw new Error(
      `Expected a 200 status when going to the initial URL of the site (${startUrl}). Got a ${status} instead.`
    );
  }
  logger.debug(`Navigated to ${startUrl}`);

  // Start simulating user interaction events
  logger.info("Starting simulation...");

  const startTime = DateTime.utc();
  const screenshotsDir = await prepareScreenshotsDir(outputDir);
  const storyboard: StoryboardOptions =
    screenshottingOptions.enabled &&
    screenshottingOptions.storyboardOptions.enabled
      ? { enabled: true, screenshotsDir }
      : { enabled: false };
  const replayResult = await replayUserInteractions({
    page,
    logLevel,
    sessionData,
    moveBeforeClick: true,
    virtualTime: skipPauses ? { enabled: true } : { enabled: false },
    storyboard,
    onTimelineEvent,
    ...(maxDurationMs != null ? { maxDurationMs } : {}),
    ...(maxEventCount != null ? { maxEventCount } : {}),
  });
  logger.debug(`Replay result: ${JSON.stringify(replayResult)}`);

  // Pad replay time according to session duration recorded with rrweb
  if (padTime && !skipPauses && replayResult.length === "full") {
    const rrwebRecordingDuration = getRrwebRecordingDuration(sessionData);
    if (rrwebRecordingDuration) {
      const now = DateTime.utc();
      const timeToPad = startTime
        .plus(rrwebRecordingDuration)
        .diff(now)
        .toMillis();
      logger.debug(
        `Padtime: ${timeToPad} ${rrwebRecordingDuration.toISOTime()}`
      );
      if (timeToPad > 0) {
        await new Promise<void>((resolve) => {
          setTimeout(() => {
            resolve();
          }, timeToPad);
        });
      }
    }
  }

  logger.debug("Collecting coverage data...");
  const coverageData = await page.coverage.stopJSCoverage();
  logger.debug("Collected coverage data");

  logger.info("Simulation done!");

  if (screenshottingOptions.enabled) {
    await takeScreenshot({
      page,
      outputDir,
      screenshotSelector: screenshottingOptions.screenshotSelector,
    });
  }

  logger.debug("Writing output");
  logger.debug(`Output dir: ${outputDir}`);
  await writeOutput({
    outputDir,
    metadata,
    sessionData,
    replayData,
    coverageData,
    timelineData: timelineCollector.getEntries(),
  });

  logger.debug("Closing browser");
  await browser.close();
};
