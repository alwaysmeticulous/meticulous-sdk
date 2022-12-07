import { METICULOUS_LOGGER_NAME, Replay } from "@alwaysmeticulous/common";
import chalk from "chalk";
import { prompt } from "inquirer";
import log from "loglevel";
import { buildCommand } from "../../command-utils/command-builder";
import {
  COMMON_REPLAY_OPTIONS,
  OPTIONS,
} from "../../command-utils/common-options";
import { addTestCase } from "../../utils/config.utils";
import {
  recordCommandHandler,
  RecordCommandHandlerOptions,
} from "../record/record.command";
import {
  rawReplayCommandHandler,
  RawReplayCommandHandlerOptions,
} from "../replay/replay.command";

interface Options
  extends Omit<RecordCommandHandlerOptions, "devTools" | "bypassCSP">,
    Omit<
      RawReplayCommandHandlerOptions,
      | "screenshot"
      | "appUrl"
      | "simulationIdForAssets"
      | "maxDurationMs"
      | "maxEventCount"
      | "storyboard"
      | "diffThreshold"
      | "diffPixelThreshold"
      | "sessionId"
      | "save"
      | "baseSimulationId"
    > {}

const handleTestCreation: (
  replay: Replay,
  sessionId: string
) => Promise<void> = async (replay, sessionId) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  const validationResponse = await prompt<{ value: boolean }>([
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

  const createTestResponse = await prompt<{ value: boolean }>([
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

  const testNameResponse = await prompt<{ name: string }>([
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
  disableRemoteFonts,
  noSandbox,
  skipPauses,
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

  const replayOptions: RawReplayCommandHandlerOptions = {
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
    disableRemoteFonts,
    noSandbox,
    networkStubbing,
    moveBeforeClick,
    cookiesFile,
    skipPauses,

    save: false, // we handle the saving to meticulous.json ourselves below

    // We replay against the original recorded URL
    appUrl: null,
    simulationIdForAssets: null,

    // We don't try comparing to the original screenshot, so just set these to their defaults
    baseSimulationId: null,
    diffThreshold: OPTIONS.diffThreshold.default,
    diffPixelThreshold: OPTIONS.diffPixelThreshold.default,

    // We don't expose these options
    maxDurationMs: null,
    maxEventCount: null,
    storyboard: false,
    essentialFeaturesOnly: false,
  };
  const replay = await rawReplayCommandHandler(replayOptions);

  await handleTestCreation(replay, lastSessionId);
};

export const createTestCommand = buildCommand("create-test")
  .details({
    describe: "Create a new test",
  })
  .options({
    // Common options
    apiToken: OPTIONS.apiToken,
    commitSha: OPTIONS.commitSha,
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
    screenshotSelector: {
      string: true,
      description:
        "Query selector to screenshot a specific DOM element instead of the whole page",
    },
    moveBeforeClick: OPTIONS.moveBeforeClick,
    cookiesFile: {
      string: true,
      description: "Path to cookies to inject before simulation",
    },
    ...COMMON_REPLAY_OPTIONS,
    headless: {
      ...COMMON_REPLAY_OPTIONS.headless,
      default: true,
    },
    skipPauses: {
      ...COMMON_REPLAY_OPTIONS.skipPauses,
      description:
        "Fast forward through any pauses to replay as fast as possible when replaying for the first time to create the test. Warning: this option is experimental and may be deprecated",
    },
  })
  .handler(handler);
