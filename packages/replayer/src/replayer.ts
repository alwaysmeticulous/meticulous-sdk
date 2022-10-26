import {
  METICULOUS_LOGGER_NAME,
  ReplayEventsFn,
  SessionData,
} from "@alwaysmeticulous/common";
import {
  OnReplayTimelineEventFn,
  ReplayTimelineEntry,
  VirtualTimeOptions,
} from "@alwaysmeticulous/sdk-bundles-api";
import log, { LogLevelDesc } from "loglevel";
import { DateTime } from "luxon";
import puppeteer, { Browser, Page } from "puppeteer";
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
import { logAllSpans, startSpan } from "./timing";

export const replayEvents: ReplayEventsFn = async (options) => {
  const replayEventsSpan = startSpan("replayEvents (inside overall span)");

  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  const logLevel: LogLevelDesc = logger.getLevel();

  logger.debug(options);

  const {
    appUrl,
    browser: browser_,
    outputDir,
    session,
    sessionData,
    headless,
    devTools,
    dependencies,
    padTime,
    shiftTime,
    networkStubbing,
    accelerate,
  } = options;

  // Extract replay metadata
  const metadata: ReplayMetadata = {
    session,
    options: {
      appUrl,
      outputDir,
      headless,
      devTools,
      dependencies,
      padTime,
      shiftTime,
      networkStubbing,
    },
  };

  const defaultViewport = getStartingViewport(sessionData);
  const windowWidth = defaultViewport.width + 20;
  const windowHeight = defaultViewport.height + 200;
  const puppeteerLaunchSpan = startSpan("puppeteerLaunch");
  const browser: Browser =
    browser_ ||
    (await puppeteer.launch({
      defaultViewport: defaultViewport,
      args: [
        `--window-size=${windowWidth},${windowHeight}`,
        // This disables cross-origin security. We need this in order to disable CORS for replayed network requests,
        // including the respective Preflgiht CORS requests which are not handled by the network stubbing layer.
        "--disable-web-security",
      ],
      headless: headless || false,
      devtools: devTools || false,
    }));
  puppeteerLaunchSpan.finish();

  const createIncognitoBrowserContextSpan = startSpan(
    "createIncognitoBrowserContext"
  );
  const context = await browser.createIncognitoBrowserContext();
  (await browser.defaultBrowserContext().pages()).forEach((page) =>
    page.close().catch((error) => {
      logger.error(error);
    })
  );
  createIncognitoBrowserContextSpan.finish();

  const timelineCollector = new ReplayTimelineCollector();
  const onTimelineEvent: OnReplayTimelineEventFn = (
    entry: ReplayTimelineEntry
  ) => timelineCollector.addEntry(entry);

  const createReplayPageSpan = startSpan("createReplayPage");
  const page = await createReplayPage({
    context,
    defaultViewport,
    sessionData,
    shiftTime,
    dependencies,
    onTimelineEvent,
  });
  createReplayPageSpan.finish();

  // Calculate start URL based on the one that the session originated on/from.
  const getStartURLSpan = startSpan("initializeReplayData");
  const startUrl = getStartUrl({ session, sessionData, appUrl });
  getStartURLSpan.finish();

  const initializeReplayDataSpan = startSpan("initializeReplayData");
  const replayData = await initializeReplayData({ page, startUrl });
  initializeReplayDataSpan.finish();

  // Set-up network stubbing if required
  if (networkStubbing) {
    const loadNetworkStubbingModuleSpan = startSpan(
      "loadNetworkStubbingModule"
    );
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const networkStubbingModule = require(dependencies.nodeNetworkStubbing
      .location);
    loadNetworkStubbingModuleSpan.finish();
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

  const loadBrowserContextModuleSpan = startSpan("loadBrowserContextModule");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const browserContextModule = require(dependencies.nodeBrowserContext
    .location);
  loadBrowserContextModuleSpan.finish();

  const setupBrowserContextSeeding =
    browserContextModule.setupBrowserContextSeeding as (options: {
      page: Page;
      sessionData: SessionData;
      startUrl: string;
    }) => Promise<void>;
  const setupBrowserContextSeedingSpan = startSpan(
    "setupBrowserContextSeeding"
  );
  await setupBrowserContextSeeding({
    page,
    sessionData,
    startUrl,
  });
  setupBrowserContextSeedingSpan.finish();

  // Navigate to the start URL.
  logger.debug(`Navigating to ${startUrl}`);
  const gotoStartUrlSpan = startSpan("gotoStartUrlAndWaitForDOMContentLoaded");
  const res = await page.goto(startUrl, {
    waitUntil: "domcontentloaded",
  });
  gotoStartUrlSpan.finish();
  const status = res && res.status();

  if (status !== 200) {
    throw new Error(
      `Expected a 200 status when going to the initial URL of the site (${startUrl}). Got a ${status} instead.`
    );
  }
  logger.debug(`Navigated to ${startUrl}`);

  // Start simulating user interaction events
  logger.info("Starting simulation...");

  const loadUserInteractionsModuleSpan = startSpan(
    "loadUserInteractionsModule"
  );
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const userInteractionsModule = require(dependencies.nodeUserInteractions
    .location);
  loadUserInteractionsModuleSpan.finish();
  const replayUserInteractions =
    userInteractionsModule.replayUserInteractions as (options: {
      page: Page;
      logLevel: LogLevelDesc;
      sessionData: SessionData;
      moveBeforeClick: boolean;
      virtualTime: VirtualTimeOptions;
      onTimelineEvent: OnReplayTimelineEventFn;
      screenshotsDir: string;
    }) => Promise<void>;
  const startTime = DateTime.utc();
  const screenshotsDir = await prepareScreenshotsDir(outputDir);
  const replayUserInteractionsCall = startSpan("replayUserInteractions");
  await replayUserInteractions({
    page,
    logLevel,
    sessionData,
    moveBeforeClick: true,
    virtualTime: accelerate ? { enabled: true } : { enabled: false },
    onTimelineEvent,
    screenshotsDir,
  });
  replayUserInteractionsCall.finish();

  // Pad replay time according to session duration recorded with rrweb
  if (padTime && !accelerate) {
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
  const collectCoverageSpan = startSpan("collectCoverage");
  const coverageData = await page.coverage.stopJSCoverage();
  collectCoverageSpan.finish();
  logger.debug("Collected coverage data");

  logger.info("Simulation done!");

  if (options.screenshot) {
    await takeScreenshot({
      page,
      outputDir,
      screenshotSelector: options.screenshotSelector || "",
    });
  }

  logger.debug("Writing output");
  logger.debug(`Output dir: ${outputDir}`);
  const writeOutputSpan = startSpan("writeOutput");
  await writeOutput({
    outputDir,
    metadata,
    sessionData,
    replayData,
    coverageData,
    timelineData: timelineCollector.getEntries(),
  });
  writeOutputSpan.finish();

  logger.debug("Closing browser");
  await browser.close();

  logAllSpans();
  replayEventsSpan.finish();
  logAllSpans();
  logger.info("Updated");
};
