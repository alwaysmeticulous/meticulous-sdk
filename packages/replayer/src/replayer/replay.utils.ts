import { appendFile, mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { CoverageEntry, Page } from "puppeteer";
import * as rrweb from "rrweb";
import type { event } from "rrweb/typings/types";
import { SessionData } from "../session/session.types";

export interface IDeferred<T = void> {
  resolve: (value: T) => void;
  reject: () => void;
  promise: Promise<T>;
}

export function defer<T = void>(): IDeferred<T> {
  let resolve: (value: T) => void;
  let reject: () => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return { resolve: resolve!, reject: reject!, promise };
}

// Hacks to pull out structure from an error message.
export const pullOutStructuredError: (error: string) => {
  name: string;
  message: string;
  stack: string[];
} = (error) => {
  const regexStartStringEndingInColon = new RegExp("^(.+?):");
  const errComponents = error.split("\n");
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const name = errComponents[0].match(regexStartStringEndingInColon)![1];
  const message = errComponents[0].split(name)[1];
  const stack = errComponents.slice(1);
  return {
    name,
    message,
    stack,
  };
};

export interface ReplayEventsDependency<Key extends string> {
  key: Key;
  location: string;
}

export interface BaseReplayEventsDependencies {
  [key: ReplayEventsDependency<string>["key"]]: ReplayEventsDependency<string>;
}

export interface ReplayEventsDependencies extends BaseReplayEventsDependencies {
  reanimator: ReplayEventsDependency<"reanimator">;
  replayNetworkFile: ReplayEventsDependency<"replayNetworkFile">;
  jsReplay: ReplayEventsDependency<"jsReplay">;
  rrweb: ReplayEventsDependency<"rrweb">;
}

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
  sessionData: any;
  appUrl: string;
}) => string = ({ sessionData, appUrl }) => {
  const { startUrl, startURL } = sessionData.userEvents.window;

  // Default to the base URL if we did not record startURL (legacy sessions)
  const appUrlObj = new URL(getAppUrl({ sessionData, appUrl }));
  const startRouteUrl =
    appUrlObj.pathname === "/" && !appUrlObj.search && !appUrlObj.hash
      ? new URL(startUrl || startURL)
      : appUrlObj;
  startRouteUrl.host = appUrlObj.host;
  startRouteUrl.port = appUrlObj.port;
  startRouteUrl.protocol = appUrlObj.protocol;
  startRouteUrl.username = appUrlObj.username;
  startRouteUrl.password = appUrlObj.password;

  return startRouteUrl.toString();
};

export const exposeMouseMove: (options: {
  page: Page;
}) => Promise<void> = async ({ page }) => {
  await page.exposeFunction(
    "__meticulous__replayMouseMove",
    async (x: number, y: number) => {
      await page.mouse.move(x, y);
    }
  );
};

export interface BootstrapPageOptions {
  page: Page;
  sessionData: SessionData;
  verbose: boolean;
  dependencies: ReplayEventsDependencies;
  networkStubbing: boolean;
  moveBeforeClick: boolean;
}

// This utility function sets up polly, jsreplay, reanimator and logging.
export const bootstrapPage: (
  options: BootstrapPageOptions
) => Promise<void> = async ({
  page,
  sessionData,
  verbose,
  dependencies,
  networkStubbing,
  moveBeforeClick,
}) => {
  if (verbose) {
    page.on("console", (msg) => console.log("PAGE LOG:", msg.text()));
  }
  // Disable the recording snippet and set up the recording timeline
  await page.evaluateOnNewDocument(`
    window["METICULOUS_DISABLED"] = true;
    window.__meticulous = window.__meticulous || {};
    window.__meticulous.replayTimeline = [];
  `);

  //Set up Polly and Reanimator, which need to setup prior to any other execution.
  await page.evaluateOnNewDocument(
    `console.log("Bootstrapping for Meticulous replay at " + window.location.href, window.location)`
  );

  await page.evaluateOnNewDocument(
    `window.sessionData = ${JSON.stringify(sessionData)}`
  );
  try {
    const { startUrl, startURL } = sessionData.userEvents.window;
    await page.evaluateOnNewDocument(
      `window.__meticulousStartURL = "${startUrl || startURL}"`
    );
    // TODO: fix this
    // eslint-disable-next-line no-empty
  } catch {}

  const reanimatorFile = await readFile(
    dependencies.reanimator.location,
    "utf8"
  );
  await page.evaluateOnNewDocument(reanimatorFile);

  await page.evaluateOnNewDocument(
    `window.Reanimator.replay(window['sessionData']['randomEvents'])`
  );

  if (networkStubbing) {
    const replayNetworkFile = await readFile(
      dependencies.replayNetworkFile.location,
      "utf-8"
    ); // Bundles PollyJS and supports the replay of network responses
    await page.evaluateOnNewDocument(replayNetworkFile);
    await page.evaluateOnNewDocument(`window.setUpPolly()`);
  }

  const jsReplay = await readFile(dependencies.jsReplay.location, "utf-8");
  await page.evaluateOnNewDocument(jsReplay);

  const rrweb = await readFile(dependencies.rrweb.location, "utf-8");
  await page.evaluateOnNewDocument(rrweb);

  if (moveBeforeClick) {
    await exposeMouseMove({ page });
  }
};

const wrapAndExecute = (block: string) => {
  return `(function () { ${block} })();`;
};

export const injectScript: (opts: {
  page: Page;
  url: string;
}) => Promise<void> = async (opts) => {
  await opts.page.evaluate(
    wrapAndExecute(
      [
        `const scriptElement = document.createElement("script");`,
        `scriptElement.setAttribute("type","text/javascript");`,
        `scriptElement.setAttribute("src", "${opts.url}");`,
        `console.log("Injected script ${opts.url}");`,
        `document.getElementsByTagName("head")[0].appendChild(scriptElement);`,
      ].join("\n")
    )
  );
};

export const sleep: (ms: number) => Promise<void> = async (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export function getOnEmitEventCallback(opts: {
  eventsArray: any[];
  eventsWithTimestampsArray: event[];
}) {
  return (event: event) => {
    // Add descriptions
    event = { ...event, typeDescription: eventType[event.type] } as any;
    if (event.type === rrweb.EventType.IncrementalSnapshot) {
      event = {
        ...event,
        data: {
          ...event.data,
          sourceDescription: incrementalSource[event.data.source],
        },
      } as any;
    }
    if (
      event.type === rrweb.EventType.IncrementalSnapshot &&
      event.data.source === rrweb.IncrementalSource.MouseInteraction
    ) {
      event = {
        ...event,
        data: {
          ...event.data,
          typeDescription: mouseInteractions[event.data.type],
        },
      } as any;
    }

    if (
      event.type === rrweb.EventType.IncrementalSnapshot &&
      event.data.source === rrweb.IncrementalSource.MouseMove
    ) {
      return; // Ignore move moves
    }

    opts.eventsWithTimestampsArray.push(event);

    // Strip things that may change slightly from run to run
    // if ((event as any).timestamp !== undefined) {
    //     const { timestamp, ...restOfEvent } = event as any;
    //     event = restOfEvent;
    // }
    if (event.data !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- we strip x and y
      const { x, y, ...restOfData } = event.data as any;
      event = { ...event, data: restOfData };
    }

    opts.eventsArray.push(event);
  };
}

const mouseInteractions = [
  "MouseUp",
  "MouseDown",
  "Click",
  "ContextMenu",
  "DblClick",
  "Focus",
  "Blur",
  "TouchStart",
  "TouchMove_Departed",
  "TouchEnd",
];

const incrementalSource = [
  "Mutation",
  "MouseMove",
  "MouseInteraction",
  "Scroll",
  "ViewportResize",
  "Input",
  "TouchMove",
  "MediaInteraction",
];

const eventType = [
  "DomContentLoaded",
  "Load",
  "FullSnapshot",
  "IncrementalSnapshot",
  "Meta",
  "Custom",
];

interface WriteOutputOpts {
  tempDir: string;
  recordingId: string;
  results: any;
  numSuccessRequests: number;
  numFailedRequests: number;
  errors: any[];
  requests: any;
  recordedRequests: any;
  consoleLog: string[];
  identifiers: any;
  promiseThatResolvesOnceWritesFinished: IDeferred<void>;
  promiseThatResolvesOnceServerClosed: IDeferred<void>;
  firstFailedUserEvent: any;

  /**
   * Optional. Defaults to false.
   *
   * If true then will keep the browser open after the script finishes, allowing you to inspect the HTML & debug.
   */
  hold?: boolean;

  /**
   * Data on which lines of code were executed
   */
  coverage: {
    /**
     * Raw coverage data, in terms of lines in the generated source
     */
    rawCoverageData: CoverageEntry[];
  };

  /** Optional. Used for the title of the replay movie HTML file */
  repoName?: string;

  /** Optional. Used for the title of the replay movie HTML file */
  commitHash?: string;

  /** Optional. Used for the title of the replay movie HTML file */
  movieName?: string;
}

export function writeOutput(
  opts: WriteOutputOpts,
  events: event[],
  eventsWithTimestamps: event[],
  browser: any
): void {
  const resultsPath = join(opts.tempDir, `${opts.recordingId}.results.json`);
  const consoleLogPath = join(opts.tempDir, `${opts.recordingId}.console.json`);
  const metricsDir = join(opts.tempDir, "metrics", opts.recordingId);
  const sessionSummarysDir = join(
    opts.tempDir,
    "sessionSummaries",
    opts.recordingId
  );
  const coverageDir = join(opts.tempDir, "coverage", opts.recordingId);
  const metricJSONPath = join(metricsDir, `${opts.recordingId}.metrics.json`);
  const eventsSequencePath = join(
    sessionSummarysDir,
    `${opts.recordingId}.events.json`
  );
  const domSequenceJSONPath = join(
    sessionSummarysDir,
    `${opts.recordingId}.dom-sequence.json`
  );
  const errorsJSONPath = join(
    sessionSummarysDir,
    `${opts.recordingId}.errors.json`
  );
  const actualRequestJSONPath = join(
    sessionSummarysDir,
    `${opts.recordingId}.requests.json`
  );

  const rawCoverageJSONPath = join(
    coverageDir,
    `${opts.recordingId}.raw-coverage.json`
  );

  const metricsDirExists = mkdir(metricsDir, { recursive: true });

  const sessionSummaryDirExists = mkdir(sessionSummarysDir, {
    recursive: true,
  });

  const coverageDirExists = mkdir(coverageDir, {
    recursive: true,
  });

  // Writes that depend upon coverageDir
  console.log("Writing raw-coverage.json to", rawCoverageJSONPath);
  const rawCoverageWritePromise = coverageDirExists.then(() =>
    writeFile(
      rawCoverageJSONPath,
      JSON.stringify(opts.coverage.rawCoverageData, null, "  ")
    )
  );

  // Writes that depend upon sessionSummaryDir
  console.log("Writing dom-sequence.json to", domSequenceJSONPath);
  const domSequenceJSONWritePromise = sessionSummaryDirExists.then(() =>
    writeFile(domSequenceJSONPath, JSON.stringify(events, null, "  "))
  );
  const eventsSequenceWritePromise = sessionSummaryDirExists.then(() =>
    writeFile(eventsSequencePath, JSON.stringify(eventsWithTimestamps))
  );
  const resultsWritePromise = writeFile(
    resultsPath,
    JSON.stringify(opts.results)
  ).then(
    () => {
      console.log("Wrote results.json to", resultsPath);
    },
    (err) => console.error(err)
  );
  const consoleWritePromise = writeFile(
    consoleLogPath,
    JSON.stringify(opts.consoleLog)
  ).then(
    () => {
      console.log("Wrote console.json to", consoleLogPath);
    },
    (err) => console.error(err)
  );

  console.log("Writing errors.json to", errorsJSONPath);
  const errorsWritePromise = sessionSummaryDirExists.then(() =>
    writeFile(errorsJSONPath, JSON.stringify(opts.errors || [], null, "  "))
  );

  console.log("Writing the actual request log to", actualRequestJSONPath);
  const actualRequestsWritePromise = sessionSummaryDirExists.then(() =>
    writeFile(
      actualRequestJSONPath,
      JSON.stringify(opts.requests || [], null, " ")
    )
  );

  actualRequestsWritePromise.then(() =>
    appendFile(
      actualRequestJSONPath,
      "Actual requests above, recorded requests below..." +
        JSON.stringify(opts.recordedRequests || [], null, " ")
    )
  );

  // Writes that depend upon metrics Dir
  const successNetworkMatchRatio =
    opts.numSuccessRequests /
    (opts.numSuccessRequests + opts.numFailedRequests);

  console.log("Writing metrics for the session to ", metricJSONPath);
  const metricsWritePromise = metricsDirExists.then(() =>
    writeFile(
      metricJSONPath,
      JSON.stringify({
        numSuccessRequests: opts.numSuccessRequests,
        numFailedRequests: opts.numFailedRequests,
        identifiers: opts.identifiers,
        ratio: successNetworkMatchRatio,
        firstFailedUserEvent: opts.firstFailedUserEvent,
      })
    )
  );

  if (!opts.hold) {
    if (browser) browser.close();
    opts.promiseThatResolvesOnceServerClosed.resolve();
  }
  Promise.all([
    errorsWritePromise,
    metricsWritePromise,
    domSequenceJSONWritePromise,
    eventsSequenceWritePromise,
    resultsWritePromise,
    consoleWritePromise,
    rawCoverageWritePromise,
  ]).then(() => {
    opts.promiseThatResolvesOnceWritesFinished.resolve();
  });
}

export const prepareScreenshotsDir: (tempDir: string) => Promise<void> = async (
  tempDir
) => {
  await mkdir(join(tempDir, "screenshots"), { recursive: true });
};
