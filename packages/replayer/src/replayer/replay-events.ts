import {
  METICULOUS_LOGGER_NAME,
  ReplayEventsFn,
} from "@alwaysmeticulous/common";
import log from "loglevel";
import { DateTime } from "luxon";
import puppeteer, { Browser } from "puppeteer";
import type { event } from "rrweb/typings/types";
import {
  bootstrapPage,
  defer,
  getOnEmitEventCallback,
  getRrwebRecordingDuration,
  getStartUrl,
  injectScript,
  pullOutStructuredError,
  setupPageCookies,
  sleep,
  writeOutput,
} from "./replay.utils";
import { takeScreenshot } from "./screenshot.utils";
import { isRequestForAsset } from "./snapshotAssets";

export const replayEvents: ReplayEventsFn = async (options) => {
  const {
    appUrl,
    browser: browser_,
    session,
    sessionData,
    meticulousSha,
    headless,
    devTools,
    bypassCSP,
    verbose,
    dependencies,
    padTime,
    shiftTime,
    networkStubbing,
    moveBeforeClick,
    cookies,
    cookiesFile,
  } = options;

  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  const promiseThatResolvesOnceWritesFinished = defer();
  const promiseThatResolvesOnceServerClosed = defer();

  const events: event[] = [];
  const eventsWithTimestamps: event[] = [];

  const { width, height } = sessionData.userEvents.window;

  const defaultViewport = { width, height };

  const browser: Browser =
    browser_ ||
    (await puppeteer.launch({
      defaultViewport,
      args: [`--window-size=${width + 20},${height + 200}`],
      headless: headless || false,
      devtools: devTools || false,
    }));

  const context = await browser.createIncognitoBrowserContext();

  (await browser.defaultBrowserContext().pages()).forEach((page) =>
    page.close().catch((error) => {
      logger.error(error);
    })
  );

  const page = await context.newPage();
  logger.debug("Created page");
  page.setDefaultNavigationTimeout(120000); // 2 minutes

  if (bypassCSP) {
    await page.setBypassCSP(true);
  }

  // Set viewport
  await page.setViewport({
    width: width,
    height: height,
  });

  // Record events to reconstruct console output
  const pageConsoleLogArr: string[] = [];
  page
    .on("console", (message) =>
      pageConsoleLogArr.push(
        `${message.type().substr(0, 3).toUpperCase()} ${message.text()}`
      )
    )
    .on("pageerror", ({ message }) => pageConsoleLogArr.push(message))
    .on("response", (response) =>
      pageConsoleLogArr.push(`${response.status()} ${response.url()}`)
    )
    .on("requestfailed", (request) =>
      pageConsoleLogArr.push(`${request.failure()?.errorText} ${request.url()}`)
    );

  // Register to record structured errors
  const pageErrorArr: any[] = [];
  page.on("pageerror", (e) => {
    try {
      pageErrorArr.push({
        _error: e.message,
        ...pullOutStructuredError(e.message),
      });
    } catch (e) {
      pageErrorArr.push(e);
    }
  });

  const assetUrlsLoaded: string[] = [];
  page.on("requestfinished", (request: puppeteer.HTTPRequest) => {
    if (isRequestForAsset(request)) {
      assetUrlsLoaded.push(request.url());
    }
  });

  // Bootstrap page
  await bootstrapPage({
    page,
    sessionData,
    verbose: verbose || false,
    dependencies,
    shiftTime,
    networkStubbing,
    moveBeforeClick,
  });
  page.coverage.startJSCoverage();

  if (cookies || cookiesFile) {
    await setupPageCookies({ page, cookies: cookies || [], cookiesFile });
  }

  // Navigate to the URL that the session originated on/from.
  const startUrl = getStartUrl({ session, sessionData, appUrl });
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

  await page.setRequestInterception(true);
  page.on("request", async (request) => {
    if (request.frame() === page.mainFrame() && request.isNavigationRequest()) {
      logger.warn(`WARNING: Navigating to a new page, this is likely to break replay!
-> ${request.url()}`);
      return await request.abort();
    }
    await request.continue();
  });

  // inject jquery for use in replay
  await injectScript({
    page,
    url: "https://unpkg.com/jquery@3.4.1/dist/jquery.js",
  });

  // setup callback to handle completion of replay
  await page.evaluate(`
    let movieCompletedResults = null;

    window["onMovieComplete"] = (results) => {
      console.log("Movie complete");
      movieCompletedResults = results;
    };
    window["isMovieCompleted"] = () => {
      return movieCompletedResults !== null;
    };
    window["getMovieCompletedResults"] = () => {
      return movieCompletedResults;
    };
  `);

  // Each time we record a rrweb event, we want to push it to our events array.
  // This events array is actually a sequence of DOM snapshots, consisting of full snapshots and incremental snapshots.
  // We then write these to disk via writeOutput.
  await page.evaluate(`
    const events = [];

    window["onEmitEvent"] = (event) => {
      events.push(event);
    };
    window["getEvents"] = () => {
      return events;
    };
  `);

  // Record the DOM sequence
  // TODO: HACK: Sleep to make sure rrweb has time to set up. TODO: Thread a promise through to whatever rrweb's setup is.
  await sleep(500);
  await page.evaluate(`rrweb.record({ emit: window.onEmitEvent })`);

  // inject playback data
  await page.evaluate(
    `window.__meticulousPlaybackData = ${JSON.stringify(sessionData)}`
  );
  await page.evaluate(`jsReplay.buildData(window.__meticulousPlaybackData).then(
    replayObj => replayObj.start({ accelerate: false, moveBeforeClick: ${moveBeforeClick} }))`);

  const startTime = DateTime.utc();

  await page.waitForFunction(`window["isMovieCompleted"]()`, {
    polling: 1000, // 1 second
    timeout: 1800000, // 30 minutes
  });

  // Pad replay time according to session duration recorded with rrweb
  if (padTime) {
    const rrwebRecordingDuration = getRrwebRecordingDuration(sessionData);
    if (rrwebRecordingDuration) {
      const now = DateTime.utc();
      const timeToPad = startTime
        .plus(rrwebRecordingDuration)
        .diff(now)
        .toMillis();
      if (timeToPad > 0) {
        await new Promise<void>((resolve) => {
          setTimeout(() => {
            resolve();
          }, timeToPad);
        });
      }
    }
  }

  logger.info("Replay done!");

  if (options.screenshot) {
    await takeScreenshot({
      page,
      tempDir: options.tempDir,
      screenshotSelector: options.screenshotSelector || "",
    });
  }

  await page.evaluate(`window["getEvents"]()`).then((rawEvents: event[]) => {
    const callback = getOnEmitEventCallback({
      eventsArray: events,
      eventsWithTimestampsArray: eventsWithTimestamps,
    });
    rawEvents.forEach(callback);
  });

  await page
    .evaluate(`window["getMovieCompletedResults"]()`)
    .then(async (results) => {
      results.meticulousSHA = meticulousSha;
      results.sessionID = session.id;

      // Process existing errors
      results.errors = results.errors || [];
      results.errors = results.errors.map((item: any) => {
        if (!!item && !!item._error && !!item._error.stack) {
          try {
            return {
              ...item,
              ...pullOutStructuredError(`${item._error.stack}`),
            };
          } catch (e) {
            return item;
          }
        }
        return item;
      });
      results.errors.push(...pageErrorArr);

      logger.debug(
        "Total failed to match requests: ",
        results.numFailedRequests
      );
      logger.debug(
        "Total successfully matched requests: ",
        results.numSuccessRequests
      );
      logger.debug(
        "First failed user event...",
        JSON.stringify(results.firstFailedUserEvent)
      );
      const ratio =
        results.numSuccessRequests /
        (results.numFailedRequests + results.numSuccessRequests);
      logger.debug("Ratio of successfully matched requests: ", ratio);

      logger.debug("Collecting coverage data...");
      const coverageData = await page.coverage.stopJSCoverage();
      logger.debug("Collected coverage data");

      writeOutput(
        {
          ...options,
          baseUrl: startUrl,
          assetUrls: assetUrlsLoaded,
          results,
          numSuccessRequests: results.numSuccessRequests,
          numFailedRequests: results.numFailedRequests,
          errors: [...results.errors],
          requests: results.requests,
          recordedRequests: results.recordedRequests,
          consoleLog: pageConsoleLogArr,
          identifiers: results.identifiers,
          promiseThatResolvesOnceWritesFinished,
          promiseThatResolvesOnceServerClosed,
          firstFailedUserEvent: results.firstFailedUserEvent,
          coverage: {
            rawCoverageData: coverageData,
          },
        },
        events,
        eventsWithTimestamps,
        browser
      );
    });

  return new Promise((resolve) =>
    resolve({
      eventsFinishedPromise: promiseThatResolvesOnceServerClosed.promise,
      writesFinishedPromise: promiseThatResolvesOnceWritesFinished.promise,
    })
  );
};
