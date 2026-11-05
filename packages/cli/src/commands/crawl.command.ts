import {
  createClientWithOAuth,
  createCrawlerTestRun,
  getProject,
  resolveApiTokenWithOAuth,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import type { CrawlExplorationMode } from "@alwaysmeticulous/sdk-bundles-api";
import type { CommandModule } from "yargs";
import { OPTIONS } from "../command-utils/common-options";
import { wrapHandler } from "../command-utils/sentry.utils";
import { resolveProjectIdentifier } from "../utils/resolve-project-identifier";
import {
  isLocalUrl,
  loadStorageToSeed,
  parseStartUrls,
  printSummary,
  waitForEnter,
} from "./crawl/crawl-command.utils";
import { buildCrawlReport, writeCrawlReport } from "./crawl/crawl-report";
import { loadRunCrawlBundle } from "./crawl/load-run-crawl-bundle";

const TIME_TO_WAIT_FOR_UPLOADS_MS = 20_000;

export const LOGIN_REQUIRED_EXIT_CODE = 2;

interface Options {
  apiToken: string | null | undefined;
  startUrl: string[];
  crawlingTimeoutSeconds: number;
  maxNumSessions: number;
  explorationMode: CrawlExplorationMode;
  skipTestRun: boolean;
  headless: boolean;
  nonInteractive: boolean;
  storageState: string | null | undefined;
  outputFile: string | null | undefined;
}

const handler = async ({
  apiToken,
  startUrl,
  crawlingTimeoutSeconds,
  maxNumSessions,
  explorationMode,
  skipTestRun,
  headless,
  nonInteractive,
  storageState,
  outputFile,
}: Options): Promise<void> => {
  const logger = initLogger();

  const startUrls = parseStartUrls(startUrl);
  if (startUrls.length === 0) {
    logger.error("No valid start URLs provided. Exiting.");
    process.exit(1);
  }

  const storageToSeed = await loadStorageToSeed(storageState, startUrls[0]);

  // Resolve the full auth chain (explicit token → OAuth → env var → legacy
  // config file), triggering an interactive browser login when nothing is
  // stored. OAuth tokens are user-scoped, so the project to record into is
  // resolved from the user's default project (`meticulous auth set-project`).
  const resolvedApiToken = await resolveApiTokenWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });
  const { projectId } = await resolveProjectIdentifier(resolvedApiToken);
  // Use the OAuth-aware client so the short-lived access token is refreshed
  // per request — the test-run creation happens after a potentially long
  // crawl, well past the access token's lifetime.
  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });
  const project = await getProject(client, projectId);
  if (!project) {
    logger.error("Could not retrieve project data. Is the API token correct?");
    process.exit(1);
  }

  const { runCrawl, capabilities } = await loadRunCrawlBundle();
  if (storageToSeed != null && !capabilities.storageToSeed) {
    logger.error(
      "The crawler downloaded from Meticulous doesn't support --storageState yet. Retry later, or omit --storageState.",
    );
    process.exit(1);
  }
  if (headless && !capabilities.headless) {
    logger.warn(
      "The crawler downloaded from Meticulous doesn't support --headless yet, so the browser will open in a visible window.",
    );
  }

  logger.info(
    `Crawling ${
      startUrls.length === 1 ? startUrls[0] : `${startUrls.length} URLs`
    }, recording sessions into project ${project.organization.name}/${project.name}...`,
  );

  // Nobody can log in to a headless browser, so only pause for a login when headed and interactive.
  const waitForManualLogin = !nonInteractive && !headless;

  const result = await runCrawl({
    apiToken: resolvedApiToken,
    projectId,
    // `startUrl` is sent alongside `startUrls` so that a crawler bundle predating
    // the list still crawls, rather than failing on a missing option.
    startUrl: startUrls[0],
    startUrls,
    crawlingTimeoutSeconds,
    maxNumSessions,
    explorationMode,
    onReadyForManualLogin: waitForManualLogin ? waitForEnter : undefined,
    headless,
    storageToSeed,
    logLevel: logger.getLevel(),
  });

  const report = buildCrawlReport(result, startUrls);
  if (outputFile) {
    await writeCrawlReport(outputFile, report);
  }
  printSummary(report, outputFile);
  const { sessionIds } = report;

  if (sessionIds.length === 0) {
    logger.error("No sessions were recorded. Exiting.");
    process.exit(1);
  }

  if (report.loginWallDetected) {
    if (!waitForManualLogin) {
      logger.error(
        storageToSeed != null
          ? "The crawl only reached login pages even with --storageState: it has likely expired, or is for a different origin than the first --startUrl. Capture a fresh one and retry."
          : "The crawl only reached login pages: your app requires a login. Log in once in a browser, save its storage state (cookies and local storage) to a file, and retry with --storageState <file>.",
      );
      process.exit(LOGIN_REQUIRED_EXIT_CODE);
    }
    logger.warn(
      "The crawl only reached login pages, so the recorded sessions are unlikely to be useful.",
    );
  }

  if (skipTestRun) {
    logger.info("Skipping test run creation (--skipTestRun).");
    process.exit(0);
  }

  if (isLocalUrl(startUrls[0])) {
    logger.warn(
      `The test run will replay against ${startUrls[0]}, which the Meticulous cloud can't reach. Pass --skipTestRun to only record sessions.`,
    );
  }

  logger.info("Waiting 20 seconds for any remaining uploads to complete...");
  await new Promise((resolve) =>
    setTimeout(resolve, TIME_TO_WAIT_FOR_UPLOADS_MS),
  );

  const testRun = await createCrawlerTestRun({
    client,
    sessionIds,
    appUrl: startUrls[0],
    projectId,
  });

  logger.info(`Created test run: ${testRun.url}`);

  const includedSessionIds = new Set(
    (testRun.configData.testCases ?? []).map(({ sessionId }) => sessionId),
  );
  const missingSessionIds = sessionIds.filter(
    (sessionId) => !includedSessionIds.has(sessionId),
  );
  if (missingSessionIds.length > 0) {
    logger.warn(
      `The test run includes ${includedSessionIds.size} of the ${sessionIds.length} recorded sessions. ` +
        `The following sessions were not included, likely because they hadn't finished uploading yet: ` +
        missingSessionIds.join(", "),
    );
  }

  process.exit(0);
};

export const crawlCommand: CommandModule<unknown, Options> = {
  command: "crawl",
  describe:
    "Crawl your app to record sessions and create a Meticulous test run. " +
    "Opens a browser at the given start URL and lets you log in manually before crawling starts " +
    "(with --nonInteractive or --headless it crawls straight away, signed in via --storageState if given). " +
    "Pass --startUrl more than once to crawl a list of URLs in the same browser, and so behind the same login.",
  builder: {
    apiToken: OPTIONS.apiToken,
    startUrl: {
      string: true,
      array: true,
      description:
        "A URL to crawl, e.g. https://app.example.com. Repeat the flag, or give it " +
        "several values, to crawl a list of URLs: they are crawled in order in the " +
        "same browser, so you only log in once, and each one is loaded afresh so that " +
        "it records a session of its own.",
      demandOption: true,
    },
    crawlingTimeoutSeconds: {
      number: true,
      description:
        "The maximum total time in seconds to spend crawling, shared out between the " +
        "start URLs (time spent logging in doesn't count)",
      default: 120,
    },
    maxNumSessions: {
      number: true,
      description: "The maximum number of sessions to record",
      default: 200,
    },
    explorationMode: {
      description:
        "How much of each page to explore before moving on. 'default' follows " +
        "links outwards as soon as a page's buttons have been clicked, covering " +
        "as many pages as the time budget allows. 'depth' exercises each page " +
        "first: it scrolls through the whole page, so that everything rendered " +
        "lazily below the fold is recorded, and prefers the controls that keep it " +
        "on the page, returning to the page whenever a click does navigate away.",
      choices: ["default", "depth"] as const,
      default: "default" as const,
    },
    skipTestRun: {
      boolean: true,
      description: "Don't create a test run from the recorded sessions",
      default: false,
    },
    headless: {
      boolean: true,
      description:
        "Run the browser headless. There is then no manual login pause, so pass " +
        "--storageState for apps that require a login.",
      default: false,
    },
    nonInteractive: {
      boolean: true,
      description:
        "Never wait for input: skip the manual login pause and start crawling straight " +
        `away. Exits with code ${LOGIN_REQUIRED_EXIT_CODE} if every page the crawl reached had a ` +
        "login-like URL (such as /login, /signin or /auth) or was on another origin. A login " +
        "form served at an ordinary URL is not detected.",
      default: false,
    },
    storageState: {
      string: true,
      description:
        "Path to a JSON file of cookies and local storage to load into the browser " +
        "before crawling, so that signed-in pages can be crawled without a manual " +
        "login. Accepts a Playwright storage state ({ cookies, origins }) or an array " +
        "of Puppeteer / Chrome DevTools cookies. Only the local storage of the first " +
        "--startUrl's origin is used.",
    },
    outputFile: {
      string: true,
      description:
        "Write a JSON summary of the crawl to this path: { sessionIds, startUrls, " +
        "numSessions, uniqueUrlCount, loginWallDetected }",
    },
  },
  handler: wrapHandler(handler),
};
