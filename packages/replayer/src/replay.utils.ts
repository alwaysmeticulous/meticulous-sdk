import {
  METICULOUS_LOGGER_NAME,
  ReplayEventsDependencies,
  SessionData,
} from "@alwaysmeticulous/common";
import { readFile } from "fs/promises";
import log from "loglevel";
import { DateTime, Duration } from "luxon";
import { BrowserContext, Page, Viewport } from "puppeteer";
import { isRequestForAsset } from "./assets/snapshot-assets";
import {
  ConsoleMessage,
  PageError,
  PlaybackEvent,
  ReplayData,
} from "./replay.types";
import { AssetSnapshot } from "./assets/assets.types";

export const getStartingViewport: (sessionData: SessionData) => Viewport = (
  sessionData
) => {
  const { width, height } = sessionData.userEvents.window;
  return { width, height };
};

export const createReplayPage: (options: {
  context: BrowserContext;
  defaultViewport: Viewport;
  sessionData: SessionData;
  shiftTime: boolean;
  dependencies: ReplayEventsDependencies;
}) => Promise<Page> = async ({
  context,
  defaultViewport,
  sessionData,
  shiftTime,
  dependencies,
}) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  const page = await context.newPage();
  logger.debug("Created page");
  page.setDefaultNavigationTimeout(120000); // 2 minutes

  // Set viewport
  await page.setViewport(defaultViewport);

  // Shift simulation time by patching the Date class
  if (shiftTime) {
    await patchDate({ page, sessionData });
  }

  // Disable the recording snippet and set up the replay timeline
  await page.evaluateOnNewDocument(`
    window["METICULOUS_DISABLED"] = true;
    window.__meticulous = window.__meticulous || {};
    window.__meticulous.replayTimeline = [];
  `);

  // Setup the playback snippet (rrweb)
  const playbackFile = await readFile(
    dependencies.browserPlayback.location,
    "utf-8"
  );
  await page.evaluateOnNewDocument(playbackFile);

  // Setup the user-interactions snippet
  const userInteractionsFile = await readFile(
    dependencies.browserUserInteractions.location,
    "utf-8"
  );
  await page.evaluateOnNewDocument(userInteractionsFile);

  // Collect js coverage data
  await page.coverage.startJSCoverage({ resetOnNavigation: false });

  return page;
};

const getMinMaxRrwebTimestamps: (
  sessionData: SessionData
) => [DateTime, DateTime] = (sessionData) => {
  const rrwebTimestamps = (sessionData.rrwebEvents as { timestamp?: number }[])
    .map((event) => event.timestamp || NaN)
    .filter((ts) => !isNaN(ts));
  const minRrwebTimestamp = DateTime.fromMillis(
    Math.min(...rrwebTimestamps)
  ).toUTC();
  const maxRrwebTimestamp = DateTime.fromMillis(
    Math.max(...rrwebTimestamps)
  ).toUTC();
  return [minRrwebTimestamp, maxRrwebTimestamp];
};

export const getRrwebRecordingDuration: (
  sessionData: SessionData
) => Duration | null = (sessionData) => {
  const [minRrwebTimestamp, maxRrwebTimestamp] =
    getMinMaxRrwebTimestamps(sessionData);
  const rrwebRecordingDuration = maxRrwebTimestamp.diff(minRrwebTimestamp);
  return rrwebRecordingDuration.isValid ? rrwebRecordingDuration : null;
};

export const patchDate: (options: {
  page: Page;
  sessionData: SessionData;
}) => Promise<void> = async ({ page, sessionData }) => {
  const [minRrwebTimestamp] = getMinMaxRrwebTimestamps(sessionData);
  const now = DateTime.now();
  const shift = minRrwebTimestamp.diff(now).toMillis();

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

const getAppUrl: (options: { sessionData: any; appUrl: string }) => string = ({
  sessionData,
  appUrl,
}) => {
  if (!appUrl) {
    const { startUrl, startURL } = sessionData.userEvents.window;
    return startUrl || startURL;
  }
  try {
    const url = new URL(appUrl);
    return url.toString();
  } catch (error) {
    if (error instanceof TypeError) {
      const urlHttps = new URL(`https://${appUrl}`);
      return urlHttps.toString();
    }
    throw error;
  }
};

export const getStartUrl: (options: {
  session: any;
  sessionData: any;
  appUrl: string;
}) => string = ({ session, sessionData, appUrl }) => {
  // We prefer to use the start URL from the session metadata but default to
  // startURLs present within the events data for backwards-compatibility.
  const { startUrl: sessionStartUrl } = session;
  const { startUrl, startURL } = sessionData.userEvents.window;

  // Default to the base URL if we did not record startURL (legacy sessions)
  const appUrlObj = new URL(getAppUrl({ sessionData, appUrl }));
  const startRouteUrl =
    appUrlObj.pathname === "/" && !appUrlObj.search && !appUrlObj.hash
      ? new URL(sessionStartUrl || startUrl || startURL)
      : appUrlObj;
  startRouteUrl.host = appUrlObj.host;
  startRouteUrl.port = appUrlObj.port;
  startRouteUrl.protocol = appUrlObj.protocol;
  startRouteUrl.username = appUrlObj.username;
  startRouteUrl.password = appUrlObj.password;

  return startRouteUrl.toString();
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
        contentType: response.headers()["content-type"],
        data: response.buffer(),
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
