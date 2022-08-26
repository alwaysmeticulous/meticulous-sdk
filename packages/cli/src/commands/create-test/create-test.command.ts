import { METICULOUS_LOGGER_NAME, Replay } from "@alwaysmeticulous/common";
import log from "loglevel";
import { CommandModule } from "yargs";
import chalk from "chalk";
import inquirer from "inquirer";
import { wrapHandler } from "../../utils/sentry.utils";
import {
  recordCommandHandler,
  RecordCommandHandlerOptions,
} from "../record/record.command";
import {
  replayCommandHandler,
  ReplayCommandHandlerOptions,
} from "../replay/replay.command";
import { addTestCase } from "../../utils/config.utils";

interface Options
  extends RecordCommandHandlerOptions,
    ReplayCommandHandlerOptions {}

const handleTestCreation: (
  replay: Replay,
  sessionId: string
) => Promise<void> = async (replay, sessionId) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  const validationResponse = await inquirer.prompt<{ value: boolean }>([
    {
      type: "confirm",
      name: "value",
      message: "Does the end state screenshot match your expectation?",
      default: true,
    },
  ]);

  if (!validationResponse.value) {
    return;
  }

  const createTestResponse = await inquirer.prompt<{ value: boolean }>([
    {
      type: "confirm",
      name: "value",
      message: `Would you like to save this as a test to ${chalk.green(
        "meticulous.json"
      )}?`,
      default: true,
    },
  ]);

  if (!createTestResponse.value) {
    return;
  }

  const testNameResponse = await inquirer.prompt<{ name: string }>([
    {
      type: "input",
      name: "name",
      message: "Test name:",
      default: `${sessionId} | ${replay.id}`,
    },
  ]);

  await addTestCase({
    title: testNameResponse.name,
    sessionId,
    baseReplayId: replay.id,
  });

  logger.info(
    chalk.bold.white(`Test saved to ${chalk.green("meticulous.json")}.`)
  );
};

// The create-test handler combines recording a session and simulating it for
// validation.
const handler: (options: Options) => Promise<void> = async ({
  // Common options
  apiToken,
  commitSha,
  devTools,
  bypassCSP,
  // Record options
  width,
  height,
  uploadIntervalMs,
  incognito,
  trace,
  // Replay options
  headless,
  screenshotSelector,
  padTime,
  shiftTime,
  networkStubbing,
  moveBeforeClick,
  cookiesFile,
}) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  logger.info("Creating a new Meticulous test");
  logger.info("Step 1: record a new test");

  let lastSessionId = "";
  const onDetectedSession = (sessionId: string) => {
    lastSessionId = sessionId;
  };

  // 1. Record
  const recordOptions: RecordCommandHandlerOptions = {
    apiToken,
    commitSha,
    devTools,
    bypassCSP,
    width,
    height,
    uploadIntervalMs,
    incognito,
    trace,
    onDetectedSession,
  };
  await recordCommandHandler(recordOptions);

  logger.debug(`lastSessionId = ${lastSessionId}`);

  if (!lastSessionId) {
    logger.error("No test was recorded!");
    process.exit(1);
  }

  logger.info("Step 2: validating the new test...");

  const replayOptions: ReplayCommandHandlerOptions = {
    apiToken,
    commitSha,
    sessionId: lastSessionId,
    headless,
    devTools,
    bypassCSP,
    screenshot: true,
    screenshotSelector,
    padTime,
    shiftTime,
    networkStubbing,
    moveBeforeClick,
    cookiesFile,
  };
  const replay = await replayCommandHandler(replayOptions);

  await handleTestCreation(replay, lastSessionId);
};

export const createTest: CommandModule<unknown, Options> = {
  command: "create-test",
  describe: "Create a new test",
  builder: {
    // Common options
    apiToken: {
      string: true,
      demandOption: true,
    },
    commitSha: {
      string: true,
    },
    devTools: {
      boolean: true,
      description: "Open Chrome Dev Tools",
    },
    bypassCSP: {
      boolean: true,
      description: "Enables bypass CSP in the browser",
    },
    // Record options
    width: {
      number: true,
    },
    height: {
      number: true,
    },
    uploadIntervalMs: {
      number: true,
      description: "Meticulous recording upload interval (in milliseconds)",
    },
    incognito: {
      boolean: true,
      description: "Use an incognito browsing context",
      default: true,
    },
    trace: {
      boolean: true,
      description: "Enable verbose logging",
    },
    // Replay options
    headless: {
      boolean: true,
      description: "Start browser in headless mode",
      default: true,
    },
    screenshotSelector: {
      string: true,
      description:
        "Query selector to screenshot a specific DOM element instead of the whole page",
    },
    padTime: {
      boolean: true,
      description: "Pad simulation time according to recording duration",
      default: true,
    },
    shiftTime: {
      boolean: true,
      description:
        "Shift time during simulation to be set as the recording time",
      default: true,
    },
    networkStubbing: {
      boolean: true,
      description: "Stub network requests during simulation",
      default: true,
    },
    moveBeforeClick: {
      boolean: true,
      description: "Simulate mouse movement before clicking",
    },
    cookiesFile: {
      string: true,
      description: "Path to cookies to inject before simulation",
    },
  },
  handler: wrapHandler(handler),
};
