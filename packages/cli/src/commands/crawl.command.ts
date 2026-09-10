import {
  createClientWithOAuth,
  createCrawlerTestRun,
  getProject,
  resolveApiTokenWithOAuth,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import { fetchAsset } from "@alwaysmeticulous/downloading-helpers";
import type {
  RunCrawlOptions,
  RunCrawlResult,
} from "@alwaysmeticulous/sdk-bundles-api";
import type { CommandModule } from "yargs";
import { OPTIONS } from "../command-utils/common-options";
import { wrapHandler } from "../command-utils/sentry.utils";
import { resolveProjectIdentifier } from "../utils/resolve-project-identifier";

const RUN_CRAWL_BUNDLE_PATH = "crawler/v1/run-crawl.bundle.js";

const TIME_TO_WAIT_FOR_UPLOADS_MS = 20_000;

interface Options {
  apiToken: string | null | undefined;
  startUrl: string[];
  crawlingTimeoutSeconds: number;
  maxNumSessions: number;
  skipTestRun: boolean;
}

const handler = async ({
  apiToken,
  startUrl,
  crawlingTimeoutSeconds,
  maxNumSessions,
  skipTestRun,
}: Options): Promise<void> => {
  const logger = initLogger();

  const startUrls = parseStartUrls(startUrl);
  if (startUrls.length === 0) {
    logger.error("No valid start URLs provided. Exiting.");
    process.exit(1);
  }

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

  logger.info(
    `Crawling ${
      startUrls.length === 1 ? startUrls[0] : `${startUrls.length} URLs`
    }, recording sessions into project ${project.organization.name}/${project.name}...`,
  );

  const onReadyForManualLogin = () => {
    logger.info("");
    logger.info(
      "A browser window has opened at your start URL. If your app requires login, log in now.",
    );
    logger.info(
      "(warning: recording has already started, so the login will be part of the recorded session and may store credentials)",
    );
    logger.info("Once you're ready, press Enter here to start crawling...");
    return new Promise<void>((resolve) => {
      process.stdin.once("data", () => resolve());
    });
  };

  const { sessionIds, uniqueUrlCount } = await runCrawl({
    apiToken: resolvedApiToken,
    projectId,
    // `startUrl` is sent alongside `startUrls` so that a crawler bundle predating
    // the list still crawls, rather than failing on a missing option.
    startUrl: startUrls[0],
    startUrls,
    crawlingTimeoutSeconds,
    maxNumSessions,
    onReadyForManualLogin,
    logLevel: logger.getLevel(),
  });

  logger.info(
    `Recorded ${sessionIds.length} sessions over ${uniqueUrlCount} unique URLs.`,
  );

  if (sessionIds.length === 0) {
    logger.error("No sessions were recorded. Exiting.");
    process.exit(1);
  }

  if (skipTestRun) {
    logger.info("Skipping test run creation (--skipTestRun).");
    process.exit(0);
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

/**
 * Drops duplicates, which would otherwise each burn part of the crawling budget,
 * and rejects anything that isn't a URL up front rather than several minutes into
 * a crawl.
 */
const parseStartUrls = (startUrls: string[]): string[] => {
  const logger = initLogger();
  const valid = startUrls.filter((url) => {
    try {
      new URL(url);
      return true;
    } catch {
      logger.error(`Skipping '${url}': not a valid URL.`);
      return false;
    }
  });
  return [...new Set(valid)];
};

const runCrawl = async (options: RunCrawlOptions): Promise<RunCrawlResult> => {
  const bundleLocation = await fetchAsset(RUN_CRAWL_BUNDLE_PATH);

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (await require(bundleLocation)).runCrawl(options);
};

export const crawlCommand: CommandModule<unknown, Options> = {
  command: "crawl",
  describe:
    "Crawl your app to record sessions and create a Meticulous test run. " +
    "Opens a browser at the given start URL and lets you log in manually before crawling starts. " +
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
    skipTestRun: {
      boolean: true,
      description: "Don't create a test run from the recorded sessions",
      default: false,
    },
  },
  handler: wrapHandler(handler),
};
