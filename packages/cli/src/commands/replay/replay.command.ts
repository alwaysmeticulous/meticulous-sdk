import type { replayEvents as replayEventsFn } from "@alwaysmeticulous/replayer";
import { mkdir, mkdtemp, writeFile } from "fs/promises";
import { DateTime } from "luxon";
import { join } from "path";
import { CommandModule } from "yargs";
import { createClient } from "../../api/client";
import {
  createReplay,
  getReplayPushUrl,
  putReplayPushedStatus,
} from "../../api/replay.api";
import { uploadArchive } from "../../api/upload";
import { createReplayArchive, deleteArchive } from "../../archive/archive";
import { getMeticulousLocalDataDir } from "../../local-data/local-data";
import { fetchAsset } from "../../local-data/replay-assets";
import {
  getOrFetchRecordedSession,
  getOrFetchRecordedSessionData,
} from "../../local-data/sessions";
import { getCommitSha } from "../../utils/commit-sha.utils";
import { getMeticulousVersion } from "../../utils/version.utils";

interface Options {
  apiToken?: string | null | undefined;
  commitSha?: string | null | undefined;
  sessionId: string;
  appUrl: string;
}

const handler: (options: Options) => Promise<void> = async ({
  apiToken,
  commitSha: commitSha_,
  sessionId,
  appUrl,
}) => {
  const client = createClient({ apiToken });

  // 1. Check session files
  const session = await getOrFetchRecordedSession(client, sessionId);
  const sessionData = await getOrFetchRecordedSessionData(client, sessionId);

  // 2. Guess commit SHA1
  const commitSha = (await getCommitSha(commitSha_)) || "unknown";
  console.log(`Commit: ${commitSha}`);

  const meticulousSha = await getMeticulousVersion();

  // 3. Load replay assets
  const reanimator = await fetchAsset(
    "https://snippet.meticulous.ai/replay/v1/reanimator.bundle.js"
  );
  const replayNetworkFile = await fetchAsset(
    "https://snippet.meticulous.ai/replay/v1/replay-network-events.bundle.js"
  );
  const jsReplay = await fetchAsset(
    "https://snippet.meticulous.ai/replay/v1/replay-only-replayjs-forked.js"
  );
  const rrweb = await fetchAsset(
    "https://snippet.meticulous.ai/replay/v1/rrweb.js"
  );

  // 4. Load replay package
  let replayEvents: typeof replayEventsFn;

  try {
    const replayer = await require("@alwaysmeticulous/replayer");
    replayEvents = replayer.replayEvents;
  } catch (error) {
    console.error("Error: could not import @alwaysmeticulous/replayer");
    console.error(error);
    process.exit(1);
  }

  // 5. Create replay directory
  await mkdir(join(getMeticulousLocalDataDir(), "replays"), {
    recursive: true,
  });
  const tempDir = await mkdtemp(
    join(getMeticulousLocalDataDir(), "replays", `${new Date().toISOString()}-`)
  );

  // 6. Create and save replay parameters
  const replayEventsParams: Parameters<typeof replayEvents>[0] = {
    appUrl,
    browser: null,
    tempDir,
    session,
    sessionData,
    recordingId: "manual-replay",
    meticulousSha: "meticulousSha",
    headless: false,
    devTools: false,
    dependencies: {
      reanimator: {
        key: "reanimator",
        location: reanimator,
      },
      replayNetworkFile: {
        key: "replayNetworkFile",
        location: replayNetworkFile,
      },
      jsReplay: {
        key: "jsReplay",
        location: jsReplay,
      },
      rrweb: {
        key: "rrweb",
        location: rrweb,
      },
    },
  };
  await writeFile(
    join(tempDir, "replayEventsParams.json"),
    JSON.stringify(replayEventsParams)
  );

  // 7. Perform replay
  console.log("Starting replay...");
  const startTime = DateTime.utc();

  const { eventsFinishedPromise, writesFinishedPromise } = await replayEvents(
    replayEventsParams
  );

  await eventsFinishedPromise;
  await writesFinishedPromise;

  const endTime = DateTime.utc();

  console.log(`Replay time: ${endTime.diff(startTime).as("seconds")} seconds`);
  console.log("Sending replay results to Meticulous");

  // 8. Create a Zip archive containing the replay files
  const archivePath = await createReplayArchive(tempDir);

  // 9. Get upload URL
  const replay = await createReplay({
    client,
    commitSha,
    sessionId,
    meticulousSha,
    metadata: {},
  });
  const uploadUrlData = await getReplayPushUrl(client, replay.id);
  if (!uploadUrlData) {
    console.error("Error: Could not get a push URL from the Meticulous API");
    process.exit(1);
  }
  const uploadUrl = uploadUrlData.pushUrl;

  // 10. Send archive to S3
  try {
    await uploadArchive(uploadUrl, archivePath);
  } catch (error) {
    await putReplayPushedStatus(client, replay.id, "failure").catch(
      (updateError) => console.error(updateError)
    );
    console.error(error);
    process.exit(1);
  }

  // 11. Report successful upload to Meticulous
  const updatedProjectBuild = await putReplayPushedStatus(
    client,
    replay.id,
    "success"
  );
  console.log("Replay artifacts successfully sent to Meticulous");
  console.log(updatedProjectBuild);

  const replayUrl = `https://app.meticulous.ai/projects/${replay.project.organization.name}/${replay.project.name}/replays/${replay.id}`;
  console.log(`View replay at: ${replayUrl}`);

  await deleteArchive(archivePath);
};

export const replay: CommandModule<{}, Options> = {
  command: "replay",
  describe: "Replay a recorded session",
  builder: {
    apiToken: {
      string: true,
    },
    commitSha: {
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
  },
  handler,
};
