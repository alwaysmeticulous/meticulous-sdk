import type { createReplayer as createReplayerFn } from "@alwaysmeticulous/replay-debugger";
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
}

const handler: (options: Options) => Promise<void> = async ({
  apiToken,
  sessionId,
  appUrl,
  devTools,
  networkStubbing,
}) => {
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
  let createReplayer: typeof createReplayerFn;

  try {
    const replayDebugger = await require("@alwaysmeticulous/replay-debugger");
    createReplayer = replayDebugger.createReplayer;
  } catch (error) {
    console.error("Error: could not import @alwaysmeticulous/replay-debugger");
    console.error(error);
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
  };
  await createReplayer(createReplayerParams);
};

export const debugReplay: CommandModule<unknown, Options> = {
  command: "debug-replay",
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
  },
  handler: wrapHandler(handler),
};
