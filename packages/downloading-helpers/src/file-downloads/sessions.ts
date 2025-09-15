import { join } from "path";
import { SessionData } from "@alwaysmeticulous/api";
import {
  getRecordedSession,
  getRecordedSessionData,
  MeticulousClient,
} from "@alwaysmeticulous/client";
import {
  getMeticulousLocalDataDir,
  initLogger,
} from "@alwaysmeticulous/common";
import { getOrDownloadJsonFile, sanitizeFilename } from "./local-data.utils";

export const getOrFetchRecordedSession = async (
  client: MeticulousClient,
  sessionId: string,
): Promise<{ fileName: string; data: any }> => {
  const logger = initLogger();

  const sessionFile = join(
    getMeticulousLocalDataDir(),
    "sessions",
    `${sanitizeFilename(sessionId)}.json`,
  );

  const session = await getOrDownloadJsonFile({
    filePath: sessionFile,
    dataDescription: "session",
    downloadJson: () => getRecordedSession(client, sessionId),
  });
  if (!session) {
    logger.error(
      "Error: Could not retrieve session. Is the API token correct?",
    );
    process.exit(1);
  }

  return { fileName: sessionFile, data: session };
};

export const getOrFetchRecordedSessionData = async (
  client: MeticulousClient,
  sessionId: string,
): Promise<{ fileName: string; data: SessionData }> => {
  const logger = initLogger();

  const sessionFile = join(
    getMeticulousLocalDataDir(),
    "sessions",
    `${sanitizeFilename(sessionId)}_data.json`,
  );

  const sessionData = await getOrDownloadJsonFile({
    filePath: sessionFile,
    dataDescription: "session data",
    downloadJson: () => getRecordedSessionData(client, sessionId),
  });
  if (!sessionData) {
    logger.error(
      "Error: Could not retrieve session data. This may be an invalid session",
    );
    process.exit(1);
  }

  return { fileName: sessionFile, data: sessionData };
};
