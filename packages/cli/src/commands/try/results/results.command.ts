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
}

const handler = async (options: Options): Promise<void> => {
  const repoRoot = repoRootFrom(options.cwd);
  const { client, context } = createTryClient({
    apiToken: options.apiToken,
    repoRoot,
  });
  const fetch = () => fetchTryResults({ client, repoRoot, context });
  const results = await pollUntilDone(fetch, options.waitSeconds);
  printResult(options.json, results, () => formatResults(results));
};

const pollUntilDone = async (
  fetch: () => Promise<TryResults>,
  waitSeconds: number,
): Promise<TryResults> => {
  const deadline = Date.now() + waitSeconds * 1000;
  for (;;) {
    const results = await fetch();
    if (results.allDone || Date.now() + POLL_INTERVAL_MS > deadline) {
      return results;
    }
    const running = results.prs.filter((pr) => pr.pending).length;
    logNotice(`${running} backtest(s) still running, checking again in 30s…`);
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
};

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
  },
  handler: wrapHandler(handler),
};
