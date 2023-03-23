import { SDKReplayTimelineEntry } from "@alwaysmeticulous/api";
import {
  COMMON_CHROMIUM_FLAGS,
  METICULOUS_LOGGER_NAME,
  ReplayEventsFn,
} from "@alwaysmeticulous/common";
import {
  OnReplayTimelineEventFn,
  ReplayUserInteractionsResult,
  SetupReplayNetworkStubbingFn,
  VirtualTimeOptions,
} from "@alwaysmeticulous/sdk-bundles-api";
import { SetupBrowserContextSeedingFn } from "@alwaysmeticulous/sdk-bundles-api/dist/replay/sdk-to-bundle";
import log, { LogLevelDesc } from "loglevel";
import { Browser, launch } from "puppeteer";
import { openStepThroughDebuggerUI } from "./debugger/replay-debugger.ui";
import { prepareScreenshotsDir, writeOutput } from "./output.utils";
import { ReplayMetadata } from "./replay.types";
import {
  createReplayPage,
  getOriginalSessionStartUrl,
  getSessionDuration,
  getStartingViewport,
  getStartUrl,
  getUserAgentOverride,
  initializeReplayData,
} from "./replay.utils";
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
    generatedBy,
    parentPerformanceSpan,
    enableStepThroughDebugger,
  } = options;

  // Extract replay metadata
  const {
    headless,
    devTools,
    shiftTime,
    networkStubbing,
    skipPauses,
    maxDurationMs,
    maxEventCount,
    disableRemoteFonts,
    noSandbox,
    bypassCSP,
    moveBeforeClick,
    essentialFeaturesOnly,
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
  const puppeteerLaunchSpan = parentPerformanceSpan?.startChild({
    op: "puppeteerLaunch",
  });
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
  puppeteerLaunchSpan?.finish();

  const createIncognitoBrowserContextSpan = parentPerformanceSpan?.startChild({
    op: "createIncognitoBrowserContext",
  });
  const context = await browser.createIncognitoBrowserContext();
  (await browser.defaultBrowserContext().pages()).forEach((page) =>
    page.close().catch((error) => {
      logger.error(error);
    })
  );
  createIncognitoBrowserContextSpan?.finish();

  const timelineCollector = new ReplayTimelineCollector();
  const onTimelineEvent: OnReplayTimelineEventFn = (
    entry: SDKReplayTimelineEntry
  ) => timelineCollector.addEntry(entry);

  const virtualTime: VirtualTimeOptions = skipPauses
    ? { enabled: true }
    : { enabled: false };
  const createReplayPageSpan = parentPerformanceSpan?.startChild({
    op: "createReplayPage",
  });

  const userAgentOverride = getUserAgentOverride();
  const page = await createReplayPage({
    context,
    defaultViewport,
    sessionData,
    shiftTime,
    dependencies,
    onTimelineEvent,
    bypassCSP,
    virtualTime,
    essentialFeaturesOnly,
    ...(userAgentOverride ? { userAgent: userAgentOverride } : {}),
  });
  createReplayPageSpan?.finish();

  // Calculate start URL based on the one that the session originated on/from.
  const originalSessionStartUrl = getOriginalSessionStartUrl({
    session,
    sessionData,
  });
  const getStartURLSpan = parentPerformanceSpan?.startChild({
    op: "getStartUrl",
  });
  const { startUrl, postNavigationPageFn, checkForStatusCode } =
    await getStartUrl({
      session,
      sessionData,
      appUrl,
      logger,
    });
  getStartURLSpan?.finish();

  const initializeReplayDataSpan = parentPerformanceSpan?.startChild({
    op: "initializeReplayData",
  });
  const replayData = await initializeReplayData({ page, startUrl });
  initializeReplayDataSpan?.finish();

  const loadReplayUserInteractionsExports = parentPerformanceSpan?.startChild({
    op: "loadReplayUserInteractionsExports",
  });
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const replayUserInteractionsExports = require(dependencies
    .nodeUserInteractions.location);
  loadReplayUserInteractionsExports?.finish();

  await page.setRequestInterception(true);
  const replayUserInteractions =
    await replayUserInteractionsExports.boostrapUserInteractions({
      page,
      logLevel,
    });

  // Set-up network stubbing if required
  if (networkStubbing) {
    const loadNetworkStubbingExportsSpan = parentPerformanceSpan?.startChild({
      op: "loadNetworkStubbingExportsSpan",
    });
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const networkStubbingExports = require(dependencies.nodeNetworkStubbing
      .location);
    loadNetworkStubbingExportsSpan?.finish();
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

  const loadBrowserContextSeedingExportsSpan =
    parentPerformanceSpan?.startChild({
      op: "loadBrowserContextModule",
    });
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const browserContextSeedingExports = require(dependencies.nodeBrowserContext
    .location);
  loadBrowserContextSeedingExportsSpan?.finish();
  const setupBrowserContextSeeding: SetupBrowserContextSeedingFn =
    browserContextSeedingExports.setupBrowserContextSeeding;
  const setupBrowserContextSeedingSpan = parentPerformanceSpan?.startChild({
    op: "setupBrowserContextSeeding",
  });
  await setupBrowserContextSeeding({
    page,
    sessionData,
    startUrl,
  });
  setupBrowserContextSeedingSpan?.finish();

  // Navigate to the start URL.
  logger.debug(`Navigating to ${startUrl}`);
  const gotoStartUrlSpan = parentPerformanceSpan?.startChild({
    op: "gotoStartUrlAndWaitForDOMContentLoaded",
  });
  const res = await page.goto(startUrl, {
    waitUntil: "domcontentloaded",
  });
  gotoStartUrlSpan?.finish();
  const status = res && res.status();

  if (checkForStatusCode && status !== 200) {
    throw new Error(
      `Expected a 200 status when going to the initial URL of the site (${startUrl}). Got a ${status} instead.`
    );
  }
  logger.debug(`Navigated to ${startUrl}`);

  if (postNavigationPageFn) {
    logger.debug("Running post navigation function...");
    await postNavigationPageFn(page);
  }

  // Start simulating user interaction events
  logger.info("Starting simulation...");

  const screenshotsDirectory = await prepareScreenshotsDir(outputDir);
  const takeIntermediateScreenshots =
    screenshottingOptions.enabled &&
    screenshottingOptions.storyboardOptions.enabled;
  const takeEndStateScreenshot = screenshottingOptions.enabled;
  const sessionDuration = getSessionDuration(sessionData);

  const onBeforeUserEvent = enableStepThroughDebugger
    ? await openStepThroughDebuggerUI({
        browser,
        replayedPage: page,
        replayableEvents: sessionData.userEvents.event_log,
      })
    : null;

  const replayUserInteractionsCall = parentPerformanceSpan?.startChild({
    op: "replayUserInteractions",
  });
  let replayResult: ReplayUserInteractionsResult;
  let browserHasFrozen = false;
  try {
    replayResult = await replayUserInteractions({
      sdkSemanticVersion: 1,
      page,
      logLevel,
      sessionData,
      moveBeforeClick,
      virtualTime,
      screenshots: {
        screenshotsDirectory,
        takeIntermediateScreenshots,
        takeEndStateScreenshot,
      },
      onTimelineEvent,
      sessionDurationMs: sessionDuration.milliseconds,
      ...(onBeforeUserEvent != null ? { onBeforeUserEvent } : {}),
      ...(maxDurationMs != null ? { maxDurationMs } : {}),
      ...(maxEventCount != null ? { maxEventCount } : {}),
    });
    logger.debug(`Replay result: ${JSON.stringify(replayResult)}`);
  } catch (error) {
    replayResult = { length: "short", reason: "error" };
    logger.error("Error thrown during replay", error);

    if (error instanceof Error && error.name === "MeticulousTimeoutError") {
      // If we hit a timeout error it's sometimes because the browser has fully frozen: this means we won't be able to extract coverage logs etc.
      browserHasFrozen = true;
    }

    onTimelineEvent({
      kind: "fatalError",
      start: new Date().getTime(),
      end: new Date().getTime(),
      data: serializeError(error),
    });
  } finally {
    replayUserInteractionsCall?.finish();
  }

  logger.debug("Collecting coverage data...");
  const collectCoverageSpan = parentPerformanceSpan?.startChild({
    op: "collectCoverage",
  });
  const coverageData =
    essentialFeaturesOnly || browserHasFrozen
      ? []
      : await page.coverage.stopJSCoverage();
  collectCoverageSpan?.finish();
  logger.debug("Collected coverage data");

  logger.info("Simulation done!");

  logger.debug("Writing output");
  logger.debug(`Output dir: ${outputDir}`);
  const writeOutputSpan = parentPerformanceSpan?.startChild({
    op: "writeOutput",
  });
  await writeOutput({
    outputDir,
    metadata,
    sessionData,
    replayData,
    coverageData,
    timelineData: timelineCollector.getEntries(),
  });
  writeOutputSpan?.finish();

  if (shouldHoldBrowserOpen()) {
    await new Promise(() => {
      /* never resolve / wait forever */
    });
  }

  logger.debug("Closing browser");
  await browser.close();

  parentPerformanceSpan?.finish();
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
