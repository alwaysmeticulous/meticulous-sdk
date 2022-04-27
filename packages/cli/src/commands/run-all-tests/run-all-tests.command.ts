import { CommandModule } from "yargs";
import { readConfig } from "../../config/config";
import { TestCase } from "../../config/config.types";
import { replayCommandHandler } from "../replay/replay.command";

interface Options {
  apiToken?: string | null | undefined;
  commitSha?: string | null | undefined;
  appUrl: string;
  headless?: boolean | null | undefined;
  devTools?: boolean | null | undefined;
  diffThreshold?: number | null | undefined;
  diffPixelThreshold?: number | null | undefined;
}

interface TestCaseResult extends TestCase {
  result: "pass" | "fail";
}

const handler: (options: Options) => Promise<void> = async ({
  apiToken,
  commitSha,
  appUrl,
  headless,
  devTools,
  diffThreshold,
  diffPixelThreshold,
}) => {
  const config = await readConfig();
  const testCases = config.testCases || [];

  if (!testCases.length) {
    console.error("Error! No test case defined");
    process.exit(1);
  }

  const results: TestCaseResult[] = [];
  for (const testCase of testCases) {
    const { sessionId, baseReplayId } = testCase;
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
    });
    const result: TestCaseResult = await replayPromise
      .then(() => ({ ...testCase, result: "pass" } as TestCaseResult))
      .catch(() => ({ ...testCase, result: "fail" }));
    results.push(result);
  }

  console.log("");
  console.log("Results");
  console.log("=======");
  results.forEach(({ sessionId, baseReplayId, result }) => {
    console.log(`${sessionId} | ${baseReplayId} => ${result}`);
  });

  if (results.find(({ result }) => result === "fail")) {
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
  },
  handler,
};
