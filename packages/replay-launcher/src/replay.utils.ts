import { readFile } from "fs/promises";
import { SessionData } from "@alwaysmeticulous/api";
import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import {
  InstallVirtualEventLoopOpts,
  OnReplayTimelineEventFn,
  VirtualTimeOptions,
} from "@alwaysmeticulous/sdk-bundles-api";
import log from "loglevel";
import { DateTime, Duration } from "luxon";
import type { Router } from "next/router";
import { BrowserContext, Page, Viewport } from "puppeteer";
import { AssetSnapshot } from "./assets/assets.types";
import { isRequestForAsset } from "./assets/snapshot-assets";
import { getNextJs404PageUrl, isSSRPage } from "./next/utils";
import {
  ConsoleMessage,
  PageError,
  PlaybackEvent,
  ReplayData,
  ReplayEventsDependencies,
} from "./replay.types";

interface NextJsWindow {
  next?: {
    router?: Router;
  };
}

export const getStartingViewport: (sessionData: SessionData) => Viewport = (
  sessionData
) => {
  const { width, height } = sessionData.userEvents.window;
  return { width, height };
};

export interface CreateReplayPageOptions {
  context: BrowserContext;
  defaultViewport: Viewport;
  sessionData: SessionData;
  shiftTime: boolean;
  dependencies: ReplayEventsDependencies;
  onTimelineEvent: OnReplayTimelineEventFn;
  bypassCSP: boolean;
  virtualTime: VirtualTimeOptions;
  essentialFeaturesOnly: boolean;
  userAgent?: string;
}

export const createReplayPage = async ({
  context,
  defaultViewport,
  sessionData,
  shiftTime,
  dependencies,
  onTimelineEvent,
  bypassCSP,
  virtualTime,
  essentialFeaturesOnly,
  userAgent,
}: CreateReplayPageOptions): Promise<Page> => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  const page = await context.newPage();
  logger.debug("Created page");
  page.setDefaultNavigationTimeout(120000); // 2 minutes
  if (bypassCSP) {
    await page.setBypassCSP(true);
  }

  if (userAgent) {
    await page.setUserAgent(userAgent);
  }

  // Log any errors/console messages
  page.on("console", (message) => {
    logger.debug(
      "Console message",
      message.type(),
      message.text(),
      ...message.args()
    );
  });

  // Set viewport
  await page.setViewport(defaultViewport);

  // Shift simulation time by patching the Date class
  const sessionStartTime = getSessionStartTime(sessionData);
  if (shiftTime) {
    await patchDate({ page, sessionStartTime });
  }

  // Disable the recording snippet and set up the replay timeline
  await page.evaluateOnNewDocument(`
    window["METICULOUS_DISABLED"] = true;
    window.__meticulous = window.__meticulous || {};
    window.__meticulous.replayTimeline = [];
  `);

  // Setup the timeline event callback
  await page.exposeFunction("__meticulous_onTimelineEvent", onTimelineEvent);

  // Setup the playback snippet (rrweb)
  if (!essentialFeaturesOnly) {
    const playbackFile = await readFile(
      dependencies.browserPlayback.location,
      "utf-8"
    );
    await page.evaluateOnNewDocument(playbackFile);
  }

  // Setup the user-interactions snippet
  const userInteractionsFile = await readFile(
    dependencies.browserUserInteractions.location,
    "utf-8"
  );
  await page.evaluateOnNewDocument(userInteractionsFile);

  if (virtualTime.enabled) {
    await installVirtualEventLoop(page, sessionStartTime);
  }

  // Setup the url-observer snippet
  const urlObserverFile = await readFile(
    dependencies.browserUrlObserver.location,
    "utf-8"
  );
  await page.evaluateOnNewDocument(urlObserverFile);

  if (!essentialFeaturesOnly) {
    await page.evaluateOnNewDocument(`
      const urlObserverStartListening = window.__meticulous?.urlObserver?.startListening;
      if(urlObserverStartListening) {
        urlObserverStartListening();
      }
    `);
  }

  if (!essentialFeaturesOnly) {
    // Collect js coverage data
    await page.coverage.startJSCoverage({ resetOnNavigation: false });
  }

  return page;
};

const installVirtualEventLoop = (page: Page, sessionStartTime: DateTime) => {
  const opts: InstallVirtualEventLoopOpts = {
    sessionStartTime: sessionStartTime.toMillis(),
  };
  return page.evaluateOnNewDocument(`
      const installVirtualEventLoop = window.__meticulous?.replayFunctions?.installVirtualEventLoop;
      if (installVirtualEventLoop) {
        installVirtualEventLoop(${JSON.stringify(opts)});
      } else {
        console.error("Could not install virtual event loop since window.__meticulous.replayFunctions.installVirtualEventLoop was null or undefined");
      }
  `);
};

export const getSessionStartTime = (sessionData: SessionData): DateTime => {
  const rrWebTimeRange = getMinMaxRrwebTimestamps(sessionData);
  if (rrWebTimeRange != null && rrWebTimeRange.min.isValid) {
    return rrWebTimeRange.min;
  }

  const userEventEventLog = sessionData.userEvents?.event_log ?? [];
  if (userEventEventLog.length === 0) {
    const logger = log.getLogger(METICULOUS_LOGGER_NAME);
    logger.warn(
      "No user or rrweb events, so cannot accurately determine start timestamp. Using current Date instead, however this will be unstable"
    );
    return DateTime.now().toUTC();
  }

  // By subtracting event.timeStamp from event.timeStampRaw we get the performance.timeOrigin plus the
  // the time between constructing the recorder and calling.start(), in other words: the time at which recording
  // started.
  //
  // Note that minUserEventTimestamp uses monotonic clock time, which can differ by multiple hours
  // from the time returned by Date.now(). We may in future want to record a dedicated
  // session start time to ensure we fully accuractly recreate the original values returned by the
  // Date.now() calls.
  const minUserEventTimestamp =
    userEventEventLog[0].timeStampRaw - userEventEventLog[0].timeStamp;
  return DateTime.fromMillis(minUserEventTimestamp).toUTC();
};

export const getSessionDuration: (sessionData: SessionData) => Duration = (
  sessionData
) => {
  const rrWebTimeRange = getMinMaxRrwebTimestamps(sessionData);
  const rrWebDuration =
    rrWebTimeRange != null ? rrWebTimeRange.max.diff(rrWebTimeRange.min) : null;

  if (rrWebDuration != null && rrWebDuration.isValid) {
    return rrWebDuration;
  }

  const userEventEventLog = sessionData.userEvents?.event_log ?? [];

  // The replayer uses the event timeStamps to work out how long to wait before replaying each event.
  // We want the amount of time we pad at the end to be consistent with this, and so we use the same
  // timestamps.
  const maxUserEventTimestamp =
    userEventEventLog[userEventEventLog.length - 1]?.timeStamp;

  if (maxUserEventTimestamp == null) {
    throw new Error("Cannot replay a session with no user events");
  }

  return Duration.fromMillis(maxUserEventTimestamp);
};

const getMinMaxRrwebTimestamps = (
  sessionData: SessionData
): { min: DateTime; max: DateTime } | null => {
  const rrwebTimestamps = (sessionData.rrwebEvents as { timestamp?: number }[])
    .map((event) => event.timestamp || NaN)
    .filter((ts) => !isNaN(ts));

  if (rrwebTimestamps.length === 0) {
    return null;
  }

  const minRrwebTimestamp = DateTime.fromMillis(
    Math.min(...rrwebTimestamps)
  ).toUTC();
  const maxRrwebTimestamp = DateTime.fromMillis(
    Math.max(...rrwebTimestamps)
  ).toUTC();
  return { min: minRrwebTimestamp, max: maxRrwebTimestamp };
};

export const patchDate: (options: {
  page: Page;
  sessionStartTime: DateTime;
}) => Promise<void> = async ({ page, sessionStartTime }) => {
  const now = DateTime.now();
  const shift = sessionStartTime.diff(now).toMillis();

  await page.evaluateOnNewDocument(`
    window.__meticulous = window.__meticulous || {};
    window.__meticulous.timeshift = window.__meticulous.timeshift || {};
    const timeshift = window.__meticulous.timeshift;

    timeshift.OriginalDate = window.Date;
    timeshift.clockShift = ${shift};

    class ShiftedDate extends timeshift.OriginalDate {
      constructor(...args) {
        if (args.length) {
          return new timeshift.OriginalDate(...args);
        }
        return new timeshift.OriginalDate(
          timeshift.OriginalDate.now() + timeshift.clockShift
        );
      }
    }

    ShiftedDate.now = () => timeshift.OriginalDate.now() + timeshift.clockShift;

    timeshift.ShiftedDate = ShiftedDate;
    window.Date = ShiftedDate;
  `);
};

const _getStartUrl: (options: {
  originalSessionStartUrl: URL;
  appUrl: string | null;
}) => string = ({ originalSessionStartUrl, appUrl }) => {
  if (!appUrl) {
    return originalSessionStartUrl.toString();
  }

  const parsedAppUrl = parseAppUrl(appUrl);

  const appUrlIsJustOrigin =
    parsedAppUrl.pathname === "/" && !parsedAppUrl.search && !parsedAppUrl.hash;

  if (!appUrlIsJustOrigin) {
    return parsedAppUrl.toString();
  }

  // Use the original URL's path, query string etc., but swap out the origin for the provided one
  const mergedUrl = new URL(originalSessionStartUrl.toString());

  mergedUrl.host = parsedAppUrl.host;
  mergedUrl.port = parsedAppUrl.port;
  mergedUrl.protocol = parsedAppUrl.protocol;
  mergedUrl.username = parsedAppUrl.username;
  mergedUrl.password = parsedAppUrl.password;

  return mergedUrl.toString();
};

export const getStartUrl: (options: {
  logger: log.Logger;
  session: any;
  sessionData: SessionData;
  appUrl: string | null;
}) => Promise<{
  startUrl: string;
  postNavigationPageFn?: (page: Page) => Promise<void>;
  checkForStatusCode: boolean;
}> = async ({ session, sessionData, appUrl }) => {
  const originalSessionStartUrl = getOriginalSessionStartUrl({
    session,
    sessionData,
  });

  const startUrl = _getStartUrl({ originalSessionStartUrl, appUrl });
  const isNextSSRPage = isSSRPage(sessionData);

  // Check if the session started on a Next.JS SSR page. If so, we start simulation the session on a 404 page.
  // We then redirect to the original start URL via a `window.next.router.replace` call.
  // This should cause Next to make a `_next/data` request to fetch the server side props for the original start URL
  // instead of making a full page navigation request. This is important because we don't want to hit the SSR page
  // during simulation and instead use the recorded server-side props.
  // Note: This doesn't handle SSGed pages at the moment but can be extended to do so as SSG page props are also recorded.
  if (!isNextSSRPage) {
    return { startUrl, checkForStatusCode: true };
  }

  const next404StartUrl = getNextJs404PageUrl(startUrl);
  const postNavigationPageFn = async (page: Page) => {
    await page.evaluate<string[], (startUrl: string) => void>(
      (_startUrl: string) => {
        (window as NextJsWindow)?.next?.router?.replace(_startUrl);
      },
      startUrl
    );
  };

  return {
    startUrl: next404StartUrl,
    postNavigationPageFn,
    checkForStatusCode: false,
  };
};

const parseAppUrl = (appUrl: string): URL => {
  try {
    return new URL(appUrl);
  } catch (error) {
    if (error instanceof TypeError) {
      const urlHttps = new URL(`https://${appUrl}`);
      return urlHttps;
    }
    throw error;
  }
};

export const getOriginalSessionStartUrl: (options: {
  session: any;
  sessionData: any;
}) => URL = ({ session, sessionData }) => {
  // We prefer to use the start URL from the session metadata but default to
  // startURLs present within the events data for backwards-compatibility.
  //
  // Note that sessionData.userEvents.window.startUrl is the URL after 1500ms,
  // while session.startUrl is the URL straight away
  const { startUrl: sessionStartUrl } = session;
  const { startUrl } = sessionData.userEvents.window;

  return new URL(sessionStartUrl || startUrl);
};

export const initializeReplayData: (options: {
  page: Page;
  startUrl: string;
}) => Promise<ReplayData> = async ({ page, startUrl }) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  const assetSnapshots: AssetSnapshot[] = [];
  const playbackEvents: PlaybackEvent[] = [];
  const consoleLogs: ConsoleMessage[] = [];
  const pageErrors: PageError[] = [];

  // Collect asset snapshots
  page.on("response", (response) => {
    if (response.ok() && isRequestForAsset(response.request())) {
      assetSnapshots.push({
        url: response.request().url(),
        contentType: response.headers()["content-type"] || "",
        getData: () => response.buffer(),
      });
    }
  });

  // Collect playback events
  await exposeOnEmitPlaybackEvent({ page, events: playbackEvents });
  page.on("framenavigated", async (frame) => {
    if (page.mainFrame() !== frame) {
      return;
    }

    try {
      await frame.evaluate(`
        window.__meticulous?.playbackFunctions?.startRecording?.();
      `);
    } catch (error) {
      // Suppress expected errors due to page navigation or tab being closed
      if (
        error instanceof Error &&
        error.message.startsWith("Execution context was destroyed")
      ) {
        return;
      }
      if (error instanceof Error && error.message.endsWith("Target closed.")) {
        return;
      }
      logger.error(error);
    }
  });

  // Collect console logs
  page.on("console", (message) => {
    consoleLogs.push({
      type: message.type(),
      message: message.text(),
      stackTrace: message.stackTrace(),
    });
  });
  page.on("pageerror", (error) => {
    pageErrors.push({
      name: error.name,
      message: error.message,
      ...(error.stack ? { stackTrace: error.stack } : {}),
    });
  });

  return {
    assetSnapshotsData: {
      baseUrl: new URL(startUrl).origin,
      assetSnapshots,
    },
    playbackData: {
      events: playbackEvents,
    },
    logs: {
      console: consoleLogs,
      pageErrors,
    },
  };
};

const exposeOnEmitPlaybackEvent: (options: {
  page: Page;
  events: any[];
}) => Promise<void> = async ({ page, events }) => {
  await page.exposeFunction(
    "__meticulous__onEmitPlaybackEvent",
    (event: any): void => {
      events.push(event);
    }
  );
};

export const getUserAgentOverride: () => string | undefined = () => {
  return process.env["METICULOUS_USER_AGENT_OVERRIDE"];
};
