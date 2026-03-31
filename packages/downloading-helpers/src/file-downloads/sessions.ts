import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { SessionData } from "@alwaysmeticulous/api";
import {
  getRecordedSession,
  getRecordedSessionData,
  MeticulousClient,
  StructuredSessionDataResponse,
  StructuredSessionSummary,
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

// ---------------------------------------------------------------------------
// Structured (agent-friendly) session data writing
// ---------------------------------------------------------------------------

export interface WriteStructuredSessionOptions {
  outputDir: string;
  sessionData: StructuredSessionDataResponse;
}

export const writeStructuredSessionData = async ({
  outputDir,
  sessionData,
}: WriteStructuredSessionOptions): Promise<void> => {
  const sessionDir = join(outputDir, "sessions", sanitizeFilename(sessionData.summary.sessionId));
  const networkDir = join(sessionDir, "network-requests");
  const storageDir = join(sessionDir, "storage");

  await mkdir(networkDir, { recursive: true });
  await mkdir(storageDir, { recursive: true });

  if (sessionData.webSockets) {
    await mkdir(join(sessionDir, "websockets"), { recursive: true });
  }

  await Promise.all([
    writeJson(join(sessionDir, "summary.json"), sessionData.summary),
    writeJson(join(sessionDir, "user-events.json"), sessionData.userEvents),
    writeJson(
      join(networkDir, "summary.json"),
      sessionData.networkRequests.summary,
    ),
    ...sessionData.networkRequests.entries.map((entry) =>
      writeJson(join(networkDir, `${entry.order}.json`), entry),
    ),
    writeJson(join(storageDir, "cookies.json"), sessionData.storage.cookies),
    writeJson(
      join(storageDir, "local-storage.json"),
      sessionData.storage.localStorage,
    ),
    ...(sessionData.storage.sessionStorage
      ? [
          writeJson(
            join(storageDir, "session-storage.json"),
            sessionData.storage.sessionStorage,
          ),
        ]
      : []),
    ...(sessionData.storage.indexedDb
      ? [
          writeJson(
            join(storageDir, "indexed-db.json"),
            sessionData.storage.indexedDb,
          ),
        ]
      : []),
    writeJson(join(sessionDir, "url-history.json"), sessionData.urlHistory),
    ...(sessionData.context
      ? [writeJson(join(sessionDir, "context.json"), sessionData.context)]
      : []),
    ...(sessionData.webSockets
      ? [
          writeJson(
            join(sessionDir, "websockets", "summary.json"),
            sessionData.webSockets.summary,
          ),
          ...sessionData.webSockets.connections.map((conn) =>
            writeJson(
              join(sessionDir, "websockets", `${conn.connectionId}.json`),
              conn,
            ),
          ),
        ]
      : []),
  ]);
};

export interface SessionsManifest {
  version: 1;
  generatedAt: string;
  sessionCount: number;
  sessions: StructuredSessionSummary[];
}

export const writeManifest = async (
  outputDir: string,
  summaries: StructuredSessionSummary[],
): Promise<void> => {
  await mkdir(join(outputDir, "sessions"), { recursive: true });

  const manifest: SessionsManifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sessionCount: summaries.length,
    sessions: summaries,
  };

  await writeJson(join(outputDir, "manifest.json"), manifest);
};

const writeJson = async (filePath: string, data: unknown): Promise<void> => {
  await writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
};

