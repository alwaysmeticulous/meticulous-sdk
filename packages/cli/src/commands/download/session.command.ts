import { createClientWithOAuth } from "@alwaysmeticulous/client";
import { initLogger, logProgress } from "@alwaysmeticulous/common";
import {
  getOrFetchRecordedSession,
  getOrFetchRecordedSessionData,
  writeManifest,
} from "@alwaysmeticulous/downloading-helpers";
import type { CommandModule } from "yargs";
import { DEFAULT_SESSION_OUTPUT_DIR } from "../../command-utils/common-options";
import { downloadSingleSession } from "../../command-utils/download-session.utils";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { requireIdArgument } from "../agent/argument-validation.utils";

type DownloadFormat = "json" | "multi-file";

interface Options {
  apiToken?: string | null | undefined;
  sessionId: string;
  format: DownloadFormat;
  outputDir: string;
  json: boolean;
}

const handler = async ({
  apiToken,
  sessionId,
  format,
  outputDir,
  json,
}: Options): Promise<void> => {
  requireIdArgument("sessionId", sessionId);
  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });

  if (format === "multi-file") {
    logProgress(`Downloading session ${sessionId} in multi-file format...`);
    const summary = await downloadSingleSession(
      client,
      sessionId,
      outputDir,
      initLogger(),
    );
    await writeManifest(outputDir, [summary]);
    if (json) {
      printJson({ sessionId, path: outputDir });
    } else {
      console.log(outputDir);
    }
    return;
  }

  const { fileName: metadataPath } = await getOrFetchRecordedSession(
    client,
    sessionId,
  );
  const { fileName: dataPath } = await getOrFetchRecordedSessionData(
    client,
    sessionId,
  );
  if (json) {
    printJson({ sessionId, metadataPath, dataPath });
  } else {
    console.log(metadataPath);
    console.log(dataPath);
  }
};

export const downloadSessionCommand: CommandModule<unknown, Options> = {
  command: "session",
  describe:
    "Download the data for a given recorded session. Outputs the local file(s) or directory it was written to.",
  builder: {
    apiToken: { string: true, description: "Meticulous API token." },
    sessionId: {
      string: true,
      demandOption: true,
      description: "The session ID.",
    },
    format: {
      choices: ["json", "multi-file"] as const,
      default: "json" as DownloadFormat,
      description:
        '"json" downloads the original single JSON file, "multi-file" writes a structured directory tree.',
    },
    outputDir: {
      string: true,
      description: "Output directory for the multi-file format.",
      default: DEFAULT_SESSION_OUTPUT_DIR,
    },
  },
  handler: wrapHandler(handler),
};
