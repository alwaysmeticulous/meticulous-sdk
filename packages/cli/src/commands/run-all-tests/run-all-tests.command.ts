import { CommandModule } from "yargs";
import { createClient } from "../../api/client";
import {
  createTestRun,
  getTestRunUrl,
  putTestRunResults,
} from "../../api/test-run.api";
import { readConfig } from "../../config/config";
import { TestCaseResult } from "../../config/config.types";
import { getCommitSha } from "../../utils/commit-sha.utils";
import { writeGitHubSummary } from "../../utils/github-summary.utils";
import { wrapHandler } from "../../utils/sentry.utils";
import { getMeticulousVersion } from "../../utils/version.utils";
import { replayCommandHandler } from "../replay/replay.command";
import { DiffError } from "../screenshot-diff/screenshot-diff.command";

interface Options {
  apiToken?: string | null | undefined;
  commitSha?: string | null | undefined;
  appUrl: string;
  headless?: boolean | null | undefined;
  devTools?: boolean | null | undefined;
  diffThreshold?: number | null | undefined;
  diffPixelThreshold?: number | null | undefined;
  githubSummary?: boolean | null | undefined;
}

const handler: (options: Options) => Promise<void> = async ({
  apiToken,
  commitSha: commitSha_,
  appUrl,
  headless,
  devTools,
  diffThreshold,
  diffPixelThreshold,
  githubSummary,
}) => {
  const client = createClient({ apiToken });

  const config = await readConfig();
  const testCases = config.testCases || [];

  if (!testCases.length) {
    console.error("Error! No test case defined");
    process.exit(1);
  }

  const commitSha = (await getCommitSha(commitSha_)) || "unknown";
  const meticulousSha = await getMeticulousVersion();
  const testRun = await createTestRun({
    client,
    commitSha,
    meticulousSha,
    configData: config,
  });

  const testRunUrl = getTestRunUrl(testRun);
  console.log("");
  console.log(`Test run URL: ${testRunUrl}`);
  console.log("");

  const results: TestCaseResult[] = [];
  for (const testCase of testCases) {
    const { sessionId, baseReplayId, options } = testCase;
    const replayPromise = replayCommandHandler({
      apiToken,
      commitSha,
      sessionId,
      appUrl,
      headless,
      devTools,
      screenshot: true,
      baseReplayId,
      diffThreshold,
      diffPixelThreshold,
      save: false,
      exitOnMismatch: false,
      ...options,
    });
    const result: TestCaseResult = await replayPromise
      .then(
        (replay) =>
          ({
            ...testCase,
            headReplayId: replay.id,
            result: "pass",
          } as TestCaseResult)
      )
      .catch((error) => {
        if (error instanceof DiffError && error.extras) {
          return {
            ...testCase,
            headReplayId: error.extras.headReplayId,
            result: "fail",
          };
        }
        return { ...testCase, headReplayId: "", result: "fail" };
      });
    results.push(result);
    await putTestRunResults({
      client,
      testRunId: testRun.id,
      status: "Running",
      resultData: { results },
    });
  }

  const runAllFailure = results.find(({ result }) => result === "fail");
  await putTestRunResults({
    client,
    testRunId: testRun.id,
    status: runAllFailure ? "Failure" : "Success",
    resultData: { results },
  });

  console.log("");
  console.log("Results");
  console.log("=======");
  console.log(`URL: ${testRunUrl}`);
  console.log("=======");
  results.forEach(({ title, result }) => {
    console.log(`${title} => ${result}`);
  });

  if (githubSummary) {
    await writeGitHubSummary({ testRun, results });
  }

  if (runAllFailure) {
    process.exit(1);
  }
};

export const runAllTests: CommandModule<unknown, Options> = {
  command: "run-all-tests",
  describe: "Run all replay test cases",
  builder: {
    apiToken: {
      string: true,
    },
    commitSha: {
      string: true,
    },
    appUrl: {
      string: true,
      demandOption: true,
    },
    headless: {
      boolean: true,
      description: "Start browser in headless mode",
    },
    devTools: {
      boolean: true,
      description: "Open Chrome Dev Tools",
    },
    diffThreshold: {
      number: true,
    },
    diffPixelThreshold: {
      number: true,
    },
    githubSummary: {
      boolean: true,
      description: "Outputs a summary page for GitHub actions",
    },
  },
  handler: wrapHandler(handler),
};
