import type { createReplayer as createReplayerFn } from "@alwaysmeticulous/replay-debugger";
import { CommandModule } from "yargs";
import { createClient } from "../../api/client";
import { fetchAsset } from "../../local-data/replay-assets";
import {
  getOrFetchRecordedSession,
  getOrFetchRecordedSessionData,
} from "../../local-data/sessions";

interface Options {
  apiToken?: string | null | undefined;
  sessionId: string;
  appUrl: string;
  devTools?: boolean | null | undefined;
}

const handler: (options: Options) => Promise<void> = async ({
  apiToken,
  sessionId,
  appUrl,
  devTools,
}) => {
  const client = createClient({ apiToken });

  // 1. Check session files
  await getOrFetchRecordedSession(client, sessionId);
  const sessionData = await getOrFetchRecordedSessionData(client, sessionId);

  // 3. Load replay assets
  const replayDebugger = await fetchAsset(
    "https://snippet.meticulous.ai/replay/v1/replay-debugger.bundle.js"
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
    appUrl,
    devTools: devTools || false,
    dependencies: {
      replayDebugger: {
        key: "replayDebugger",
        location: replayDebugger,
      },
    },
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
      demandOption: true,
    },
    devTools: {
      boolean: true,
      description: "Open Chrome Dev Tools",
    },
  },
  handler,
};
