import {
  CreateReplayDebuggerFn,
  METICULOUS_LOGGER_NAME,
} from "@alwaysmeticulous/common";
import log from "loglevel";
import { CommandModule } from "yargs";
import { createClient } from "../../api/client";
import { fetchAsset } from "../../local-data/replay-assets";
import {
  getOrFetchRecordedSession,
  getOrFetchRecordedSessionData,
} from "../../local-data/sessions";
import { wrapHandler } from "../../utils/sentry.utils";

interface Options {
  apiToken?: string | null | undefined;
  sessionId: string;
  appUrl?: string | null | undefined;
  devTools?: boolean | null | undefined;
  networkStubbing: boolean;
  moveBeforeClick?: boolean | null | undefined;
  cookiesFile?: string | null | undefined;
}

const handler: (options: Options) => Promise<void> = async ({
  apiToken,
  sessionId,
  appUrl,
  devTools,
  networkStubbing,
  moveBeforeClick,
  cookiesFile,
}) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  const client = createClient({ apiToken });

  // 1. Check session files
  await getOrFetchRecordedSession(client, sessionId);
  const sessionData = await getOrFetchRecordedSessionData(client, sessionId);

  // 3. Load replay assets
  const replayDebugger = await fetchAsset(
    "https://snippet.meticulous.ai/replay/v1/replay-debugger.bundle.js"
  );
  const reanimator = await fetchAsset(
    "https://snippet.meticulous.ai/replay/v1/reanimator.bundle.js"
  );
  const replayNetworkFile = await fetchAsset(
    "https://snippet.meticulous.ai/replay/v1/replay-network-events.bundle.js"
  );

  // 4. Load replay-debugger package
  let createReplayer: CreateReplayDebuggerFn;

  try {
    const replayDebugger = await require("@alwaysmeticulous/replay-debugger");
    createReplayer = replayDebugger.createReplayer;
  } catch (error) {
    logger.error("Error: could not import @alwaysmeticulous/replay-debugger");
    logger.error(error);
    process.exit(1);
  }

  // 5. Start replay debugger
  const createReplayerParams: Parameters<typeof createReplayer>[0] = {
    sessionData,
    appUrl: appUrl || "",
    devTools: devTools || false,
    dependencies: {
      replayDebugger: {
        key: "replayDebugger",
        location: replayDebugger,
      },
      reanimator: {
        key: "reanimator",
        location: reanimator,
      },
      replayNetworkFile: {
        key: "replayNetworkFile",
        location: replayNetworkFile,
      },
    },
    networkStubbing,
    moveBeforeClick: moveBeforeClick || false,
    cookiesFile: cookiesFile || "",
  };
  await createReplayer(createReplayerParams);
};

export const debugReplay: CommandModule<unknown, Options> = {
  command: "debug-simulation",
  aliases: ["debug-replay"],
  describe: "Replay and debug a recorded session",
  builder: {
    apiToken: {
      string: true,
    },
    sessionId: {
      string: true,
      demandOption: true,
    },
    appUrl: {
      string: true,
    },
    devTools: {
      boolean: true,
      description: "Open Chrome Dev Tools",
    },
    networkStubbing: {
      boolean: true,
      description: "Stub network requests during replay",
      default: true,
    },
    moveBeforeClick: {
      boolean: true,
      description: "Simulate mouse movement before clicking",
    },
    cookiesFile: {
      string: true,
      description: "Path to cookies to inject before replay",
    },
  },
  handler: wrapHandler(handler),
};
