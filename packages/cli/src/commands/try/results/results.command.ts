import { logNotice } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { wrapHandler } from "../../../command-utils/sentry.utils";
import {
  HELPER_OPTIONS_WITH_TOKEN,
  printResult,
  repoRootFrom,
} from "../shared/helper-options";
import { createTryClient } from "../shared/try-client";
import { fetchTryResults } from "./fetch-results";
import { formatResults } from "./format-results";
import type { TryResults } from "./types";

const POLL_INTERVAL_MS = 30_000;

interface Options {
  cwd: string | undefined;
  json: boolean;
  apiToken: string | undefined;
  waitSeconds: number;
  waitFor: number | undefined;
}

const handler = async (options: Options): Promise<void> => {
  const repoRoot = repoRootFrom(options.cwd);
  const { client, context } = createTryClient({
    apiToken: options.apiToken,
    repoRoot,
  });
  const fetch = () => fetchTryResults({ client, repoRoot, context });
  const results = await pollUntilDone(fetch, {
    waitSeconds: options.waitSeconds,
    waitFor: options.waitFor,
  });
  printResult(options.json, results, () => formatResults(results));
};

const pollUntilDone = async (
  fetch: () => Promise<TryResults>,
  options: { waitSeconds: number; waitFor: number | undefined },
): Promise<TryResults> => {
  const deadline = Date.now() + options.waitSeconds * 1000;
  for (;;) {
    const results = await fetch();
    if (
      results.allDone ||
      (options.waitFor != null && countFinished(results) >= options.waitFor) ||
      Date.now() + POLL_INTERVAL_MS > deadline
    ) {
      return results;
    }
    const running = results.prs.filter((pr) => pr.pending).length;
    logNotice(`${running} backtest(s) still running, checking again in 30s…`);
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
};

/** PRs whose head test run exists and whose runs have all finished. */
const countFinished = (results: TryResults): number =>
  results.prs.filter((pr) => pr.headTestRun != null && !pr.pending).length;

export const resultsCommand: CommandModule<unknown, Options> = {
  command: "results",
  describe:
    "Summarise the try project's test runs and Agent swarm runs per backtested PR, most compelling findings first",
  builder: {
    ...HELPER_OPTIONS_WITH_TOKEN,
    waitSeconds: {
      number: true,
      default: 0,
      description:
        "Keep polling until every backtest has finished, for at most this many seconds",
    },
    waitFor: {
      number: true,
      description:
        "With --waitSeconds, stop polling as soon as this many PRs have finished, for an early report",
    },
  },
  handler: wrapHandler(handler),
};
