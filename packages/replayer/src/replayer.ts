import { ReplayTimelineEntry } from "@alwaysmeticulous/api";
import {
  COMMON_CHROMIUM_FLAGS,
  METICULOUS_LOGGER_NAME,
  ReplayEventsFn,
} from "@alwaysmeticulous/common";
import {
  OnReplayTimelineEventFn,
  ReplayUserInteractionsFn,
  SetupReplayNetworkStubbingFn,
  StoryboardOptions,
  VirtualTimeOptions,
} from "@alwaysmeticulous/sdk-bundles-api";
import { SetupBrowserContextSeedingFn } from "@alwaysmeticulous/sdk-bundles-api/dist/replay/sdk-to-bundle";
import log, { LogLevelDesc } from "loglevel";
import { DateTime } from "luxon";
import { Browser, launch } from "puppeteer";
import { prepareScreenshotsDir, writeOutput } from "./output.utils";
import { ReplayMetadata } from "./replay.types";
import {
  createReplayPage,
  getOriginalSessionStartUrl,
  getSessionDuration,
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
    replayExecutionOptions,
    dependencies,
    screenshottingOptions,
    generatedBy,
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
    disableRemoteFonts,
    noSandbox,
    bypassCSP,
    moveBeforeClick,
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
  const puppeteerLaunchSpan = startSpan("puppeteerLaunch");
  const browser: Browser =
    browser_ ||
    (await launch({
      defaultViewport: defaultViewport,
      args: [
        `--window-size=${windowWidth},${windowHeight}`,
        // This disables cross-origin security. We need this in order to disable CORS for replayed network requests,
        // including the respective Preflgiht CORS requests which are not handled by the network stubbing layer.
        "--disable-web-security",
        ...COMMON_CHROMIUM_FLAGS,
        ...(disableRemoteFonts ? ["--disable-remote-fonts"] : []),
        ...(noSandbox ? ["--no-sandbox"] : []),
      ],
      headless: headless,
      devtools: devTools,
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

  const virtualTime: VirtualTimeOptions = skipPauses
    ? { enabled: true }
    : { enabled: false };
  const createReplayPageSpan = startSpan("createReplayPage");
  const page = await createReplayPage({
    context,
    defaultViewport,
    sessionData,
    shiftTime,
    dependencies,
    onTimelineEvent,
    bypassCSP,
    virtualTime,
  });
  createReplayPageSpan.finish();

  // Calculate start URL based on the one that the session originated on/from.
  const originalSessionStartUrl = getOriginalSessionStartUrl({
    session,
    sessionData,
  });
  const getStartURLSpan = startSpan("initializeReplayData");
  const startUrl = getStartUrl({ originalSessionStartUrl, appUrl });
  getStartURLSpan.finish();

  const initializeReplayDataSpan = startSpan("initializeReplayData");
  const replayData = await initializeReplayData({ page, startUrl });
  initializeReplayDataSpan.finish();

  // Set-up network stubbing if required
  if (networkStubbing) {
    const loadNetworkStubbingExportsSpan = startSpan(
      "loadNetworkStubbingExportsSpan"
    );
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const networkStubbingExports = require(dependencies.nodeNetworkStubbing
      .location);
    loadNetworkStubbingExportsSpan.finish();
    const setupReplayNetworkStubbing: SetupReplayNetworkStubbingFn =
      networkStubbingExports.setupReplayNetworkStubbing;
    await setupReplayNetworkStubbing({
      page,
      logLevel,
      sessionData,
      startUrl,
      originalSessionStartUrl: originalSessionStartUrl.toString(),
      onTimelineEvent,
    });
  }

  const loadBrowserContextSeedingExportsSpan = startSpan("loadBrowserContextModule");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const browserContextSeedingExports = require(dependencies.nodeBrowserContext
    .location);
  loadBrowserContextSeedingExportsSpan.finish();
  const setupBrowserContextSeeding: SetupBrowserContextSeedingFn =
    browserContextSeedingExports.setupBrowserContextSeeding;
  const setupBrowserContextSeedingSpan = startSpan(
    "setupBrowserContextSeeding"
  );
  await setupBrowserContextSeeding({
    page,
    sessionData,
    startUrl,
  });
  setupBrowserContextSeedingSpan.finish();

  const loadReplayUserInteractionsExports = startSpan(
    "loadReplayUserInteractionsExports"
  );
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const replayUserInteractionsExports = require(dependencies
    .nodeUserInteractions.location);
  loadReplayUserInteractionsExports.finish();
  const replayUserInteractions: ReplayUserInteractionsFn =
    replayUserInteractionsExports.replayUserInteractions;

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

  const startTime = DateTime.utc();
  const screenshotsDir = await prepareScreenshotsDir(outputDir);
  const storyboard: StoryboardOptions =
    screenshottingOptions.enabled &&
    screenshottingOptions.storyboardOptions.enabled
      ? { enabled: true, screenshotsDir }
      : { enabled: false };
  const sessionDuration = getSessionDuration(sessionData);
  try {
    const replayUserInteractionsCall = startSpan("replayUserInteractions");
    const replayResult = await replayUserInteractions({
      page,
      logLevel,
      sessionData,
      moveBeforeClick,
      virtualTime,
      storyboard,
      onTimelineEvent,
      ...(sessionDuration != null
        ? { sessionDurationMs: sessionDuration?.milliseconds }
        : {}),
      ...(maxDurationMs != null ? { maxDurationMs } : {}),
      ...(maxEventCount != null ? { maxEventCount } : {}),
    });
    replayUserInteractionsCall.finish();
    logger.debug(`Replay result: ${JSON.stringify(replayResult)}`);

    // Pad replay time according to session duration recorded with rrweb
    if (
      padTime &&
      !skipPauses &&
      replayResult.length === "full" &&
      sessionDuration != null
    ) {
      const now = DateTime.utc();
      const timeToPad = startTime.plus(sessionDuration).diff(now).toMillis();
      logger.debug(`Padtime: ${timeToPad} ${sessionDuration.toISOTime()}`);
      if (timeToPad > 0) {
        await new Promise<void>((resolve) => {
          setTimeout(() => {
            resolve();
          }, timeToPad);
        });
      }
    }
  } catch (error) {
    logger.error("Error thrown during replay", error);
    onTimelineEvent({
      kind: "fatalError",
      start: new Date().getTime(),
      end: new Date().getTime(),
      data: serializeError(error),
    });
  }

  logger.debug("Collecting coverage data...");
  const collectCoverageSpan = startSpan("collectCoverage");
  const coverageData = await page.coverage.stopJSCoverage();
  collectCoverageSpan.finish();
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

  if (shouldHoldBrowserOpen()) {
    await new Promise(() => {
      /* never resolve / wait forever */
    });
  }

  logger.debug("Closing browser");
  await browser.close();

  logAllSpans();
  replayEventsSpan.finish();
  logAllSpans();
  logger.info("Updated");
};

const shouldHoldBrowserOpen = () => {
  return (
    (process.env["METICULOUS_HOLD_BROWSER_OPEN"] ?? "").toLowerCase() === "true"
  );
};

const serializeError = (
  error: unknown
): { message: string | null; stack: string | null } => {
  if (error == null) {
    return { message: null, stack: null };
  }
  const message =
    toStringOrNull((error as any).message) ?? toStringOrNull(error);
  const stack = toStringOrNull((error as any).stack);
  return { message, stack };
};

const toStringOrNull = (value: unknown): string | null =>
  value != null ? `${value}` : null;
