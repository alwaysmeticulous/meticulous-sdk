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

export interface ManifestSession {
  sessionId: string;
  startUrl: string;
  eventCount: number;
  totalDurationMs: number;
  networkRequestCount: number;
  viewport: { width: number; height: number };
  pageNavigations: string[];
}

export interface SessionsManifest {
  version: 1;
  generatedAt: string;
  sessionCount: number;
  sessions: ManifestSession[];
}

export const writeManifestAndReadme = async (
  outputDir: string,
  summaries: StructuredSessionSummary[],
): Promise<void> => {
  await mkdir(join(outputDir, "sessions"), { recursive: true });

  const manifest: SessionsManifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sessionCount: summaries.length,
    sessions: summaries.map((s) => ({
      sessionId: s.sessionId,
      startUrl: s.startUrl,
      eventCount: s.eventCount,
      totalDurationMs: s.totalDurationMs,
      networkRequestCount: s.networkRequestCount,
      viewport: s.viewport,
      pageNavigations: s.pageNavigations,
    })),
  };

  const readme = generateReadme();

  await Promise.all([
    writeJson(join(outputDir, "manifest.json"), manifest),
    writeFile(join(outputDir, "README.md"), readme, "utf-8"),
  ]);
};

const writeJson = async (filePath: string, data: unknown): Promise<void> => {
  await writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
};

const generateReadme = (): string => `# Meticulous Agent Sessions

This directory contains structured session data exported from Meticulous.
Each session represents a recorded user flow that can be used for testing.

## Directory Structure

\`\`\`
manifest.json                           # List of all sessions with summary metadata
sessions/
  <sanitized-session-id>/
    summary.json                        # Session overview: URL, viewport, duration, event count
    user-events.json                    # Sequence of user interactions (clicks, typing, navigation)
    network-requests/
      summary.json                      # All network requests: method, URL, status (no bodies)
      <order>.json                      # Individual request/response pairs (with bodies)
    storage/
      cookies.json                      # Initial cookie state
      local-storage.json                # Initial localStorage state
      session-storage.json              # Initial sessionStorage (if present)
      indexed-db.json                   # Initial IndexedDB state (if present)
    url-history.json                    # Page navigation history with timestamps
    context.json                        # Feature flags, user ID, custom context (if present)
    websockets/                         # WebSocket data (if present)
      summary.json                      # WebSocket connections overview
      <connection-id>.json              # Events for each connection
\`\`\`

## How to Use

1. **Start with \`manifest.json\`** to see all available sessions and pick the relevant ones.
2. **Read \`summary.json\`** in a session directory for a quick overview.
3. **Read \`user-events.json\`** to understand the user flow (what the user clicked, typed, navigated).
4. **Browse \`network-requests/summary.json\`** to find relevant API endpoints.
5. **Read individual \`network-requests/<order>.json\`** files for full request/response data to use as mocks.
6. **Check \`storage/\`** files to understand initial application state.
`;
