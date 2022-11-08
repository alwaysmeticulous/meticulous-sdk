import {
  CreateReplayDebuggerFn,
  METICULOUS_LOGGER_NAME,
} from "@alwaysmeticulous/common";
import log from "loglevel";
import { createClient } from "../../api/client";
import { buildCommand } from "../../command-utils/command-builder";
import {
  COMMON_REPLAY_OPTIONS,
  OPTIONS,
} from "../../command-utils/common-options";
import { fetchAsset } from "../../local-data/replay-assets";
import {
  getOrFetchRecordedSession,
  getOrFetchRecordedSessionData,
} from "../../local-data/sessions";

interface Options {
  apiToken?: string | null | undefined;
  sessionId: string;
  appUrl?: string | null | undefined;
  devTools: boolean;
  shiftTime: boolean;
  networkStubbing: boolean;
  moveBeforeClick: boolean;
  cookiesFile?: string | null | undefined;
  disableRemoteFonts: boolean;
}

const handler: (options: Options) => Promise<void> = async ({
  apiToken,
  sessionId,
  appUrl,
  devTools,
  shiftTime,
  networkStubbing,
  moveBeforeClick,
  cookiesFile,
  disableRemoteFonts,
}) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  const client = createClient({ apiToken });

  // 1. Check session files
  const session = await getOrFetchRecordedSession(client, sessionId);
  const sessionData = await getOrFetchRecordedSessionData(client, sessionId);

  // 3. Load replay assets
  const browserUserInteractions = await fetchAsset(
    "replay/v2/snippet-user-interactions.bundle.js"
  );
  const nodeBrowserContext = await fetchAsset(
    "replay/v2/node-browser-context.bundle.js"
  );
  const nodeNetworkStubbing = await fetchAsset(
    "replay/v2/node-network-stubbing.bundle.js"
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
    session,
    sessionData,
    appUrl: appUrl || "",
    devTools: devTools,
    dependencies: {
      browserUserInteractions: {
        key: "browserUserInteractions",
        location: browserUserInteractions,
      },
      nodeBrowserContext: {
        key: "nodeBrowserContext",
        location: nodeBrowserContext,
      },
      nodeNetworkStubbing: {
        key: "nodeNetworkStubbing",
        location: nodeNetworkStubbing,
      },
    },
    shiftTime,
    networkStubbing,
    disableRemoteFonts,
    moveBeforeClick: moveBeforeClick,
    cookiesFile: cookiesFile || "",
  };
  await createReplayer(createReplayerParams);
};

export const debugReplay = buildCommand("debug-simulation")
  .details({
    aliases: ["debug-replay"],
    describe: "Replay and debug a recorded session",
  })
  .options({
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
    moveBeforeClick: OPTIONS.moveBeforeClick,
    cookiesFile: {
      string: true,
      description: "Path to cookies to inject before replay",
    },
    devTools: COMMON_REPLAY_OPTIONS.devTools,
    shiftTime: COMMON_REPLAY_OPTIONS.shiftTime,
    networkStubbing: COMMON_REPLAY_OPTIONS.networkStubbing,
    disableRemoteFonts: COMMON_REPLAY_OPTIONS.disableRemoteFonts,
  })
  .handler(handler);
