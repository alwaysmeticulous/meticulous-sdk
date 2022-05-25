import puppeteer, { Browser } from "puppeteer";
import type { event } from "rrweb/typings/types";
import { RecordedSession, SessionData } from "../session/session.types";
import {
  bootstrapPage,
  defer,
  getOnEmitEventCallback,
  getStartUrl,
  injectScript,
  pullOutStructuredError,
  ReplayEventsDependencies,
  sleep,
  writeOutput,
} from "./replay.utils";
import { takeScreenshot } from "./screenshot.utils";

export interface ReplayEventsOptions {
  appUrl: string;
  browser: any;
  tempDir: string;
  session: RecordedSession;
  sessionData: SessionData;
  recordingId: string;
  meticulousSha: string;
  headless?: boolean;
  devTools?: boolean;
  verbose?: boolean;
  dependencies: ReplayEventsDependencies;
  screenshot?: boolean;
  screenshotSelector?: string;
}

export const replayEvents: (options: ReplayEventsOptions) => Promise<{
  eventsFinishedPromise: Promise<void>;
  writesFinishedPromise: Promise<void>;
}> = async (options) => {
  const {
    appUrl,
    browser: browser_,
    session,
    sessionData,
    meticulousSha,
    headless,
    devTools,
    verbose,
    dependencies,
  } = options;

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
      args: [`--window-size=${width},${height}`],
      headless: headless || false,
      devtools: devTools || false,
    }));

  const context = await browser.createIncognitoBrowserContext();

  const page = await context.newPage();
  console.log("Created page");
  page.setDefaultNavigationTimeout(120000); // 2 minutes

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

  // Bootstrap page
  await bootstrapPage(page, sessionData, verbose || false, dependencies);
  page.coverage.startJSCoverage();

  // Navigate to the URL that the session originated on/from.
  const startUrl = getStartUrl({ sessionData, appUrl });
  console.log(`Navigating to ${startUrl}`);
  const res = await page.goto(startUrl, {
    waitUntil: "domcontentloaded",
  });
  const status = res.status();

  if (status !== 200) {
    throw new Error(
      `Expected a 200 status when going to the initial URL of the site. Got a ${status} instead.`
    );
  }
  console.log(`Navigated to ${startUrl}`);

  await page.setRequestInterception(true);
  page.on("request", async (request) => {
    if (request.frame() === page.mainFrame() && request.isNavigationRequest()) {
      console.log(`WARNING: Navigating to a new page, this is likely to break replay!
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
    replayObj => replayObj.start({ accelerate: "false" }))`);

  await page.waitForFunction(`window["isMovieCompleted"]()`, {
    polling: 1000, // 1 second
    timeout: 1800000, // 30 minutes
  });
  console.log("Replay done!");

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

      console.log(
        "Total failed to match requests: ",
        results.numFailedRequests
      );
      console.log(
        "Total successfully matched requests: ",
        results.numSuccessRequests
      );
      console.log(
        "First failed user event...",
        JSON.stringify(results.firstFailedUserEvent)
      );
      const ratio =
        results.numSuccessRequests /
        (results.numFailedRequests + results.numSuccessRequests);
      console.log("Ratio of successfully matched requests: ", ratio);

      console.log("Collecting coverage data...");
      const coverageData = await page.coverage.stopJSCoverage();
      console.log("Collected coverage data");

      writeOutput(
        {
          ...options,
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
