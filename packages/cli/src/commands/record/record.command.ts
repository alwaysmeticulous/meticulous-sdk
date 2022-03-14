import type { recordSession as recordSessionFn } from "@alwaysmeticulous/record";
import { CommandModule } from "yargs";
import { createClient } from "../../api/client";
import { getProject } from "../../api/project.api";
import { fetchAsset } from "../../local-data/replay-assets";
import { getCommitSha } from "../../utils/commit-sha.utils";

interface Options {
  apiToken?: string | null | undefined;
  commitSha?: string | null | undefined;
  devTools?: boolean | null | undefined;
  width?: number | null | undefined;
  height?: number | null | undefined;
}

const handler: (options: Options) => Promise<void> = async ({
  apiToken,
  commitSha: commitSha_,
  devTools,
  width,
  height,
}) => {
  // 1. Fetch the recording token
  const client = createClient({ apiToken });
  const project = await getProject(client);
  if (!project) {
    console.error("Could not retrieve project data. Is the API token correct?");
    process.exit(1);
  }

  const recordingToken = project.recordingToken;
  if (!recordingToken) {
    console.error("Could not retrieve recording token.");
    process.exit(1);
  }
  console.log(`Recording token: ${recordingToken}`);

  // 2. Guess commit SHA1
  const commitSha = (await getCommitSha(commitSha_)) || "unknown";
  console.log(`Commit: ${commitSha}`);

  // 3. Load recording snippet
  const recordingSnippet = await fetchAsset(
    "https://snippet.meticulous.ai/v1/stagingMeticulousSnippet.js"
  );

  // 4. Load recording package
  let recordSession: typeof recordSessionFn;

  try {
    const record = await require("@alwaysmeticulous/record");
    recordSession = record.recordSession;
  } catch (error) {
    console.error("Error: could not import @alwaysmeticulous/record");
    console.error(error);
    process.exit(1);
  }

  // 5. Start recording
  await recordSession({
    browser: null,
    project,
    recordingToken,
    appCommitHash: commitSha,
    devTools,
    recordingSnippet,
    width,
    height,
  });
};

export const record: CommandModule<{}, Options> = {
  command: "record",
  describe: "Record a session",
  builder: {
    apiToken: {
      string: true,
      demandOption: true,
    },
    commitSha: {
      string: true,
    },
    devTools: {
      boolean: true,
    },
    width: {
      number: true,
    },
    height: {
      number: true,
    },
  },
  handler,
};
