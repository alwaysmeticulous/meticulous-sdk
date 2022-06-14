import { getMeticulousLocalDataDir } from "@alwaysmeticulous/common";
import { AxiosInstance } from "axios";
import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { getRecordedSession, getRecordedSessionData } from "../api/session.api";
import { sanitizeFilename } from "./local-data.utils";

export const getOrFetchRecordedSession: (
  client: AxiosInstance,
  sessionId: string
) => Promise<any> = async (client, sessionId) => {
  const sessionsDir = join(getMeticulousLocalDataDir(), "sessions");
  await mkdir(sessionsDir, { recursive: true });
  const sessionFile = join(sessionsDir, `${sanitizeFilename(sessionId)}.json`);

  const existingSession = await readFile(sessionFile)
    .then((data) => JSON.parse(data.toString("utf-8")))
    .catch(() => null);
  if (existingSession) {
    console.log(`Reading session from local copy in ${sessionFile}`);
    return existingSession;
  }

  const session = await getRecordedSession(client, sessionId);
  if (!session) {
    console.error(
      "Error: Could not retrieve session. Is the API token correct?"
    );
    process.exit(1);
  }

  await writeFile(sessionFile, JSON.stringify(session, null, 2));
  console.log(`Wrote session to ${sessionFile}`);
  return session;
};

export const getOrFetchRecordedSessionData: (
  client: AxiosInstance,
  sessionId: string
) => Promise<any> = async (client, sessionId) => {
  const sessionsDir = join(getMeticulousLocalDataDir(), "sessions");
  await mkdir(sessionsDir, { recursive: true });
  const sessionDataFile = join(
    sessionsDir,
    `${sanitizeFilename(sessionId)}_data.json`
  );

  const existingSessionData = await readFile(sessionDataFile)
    .then((data) => JSON.parse(data.toString("utf-8")))
    .catch(() => null);
  if (existingSessionData) {
    console.log(`Reading session data from local copy in ${sessionDataFile}`);
    return existingSessionData;
  }

  const sessionData = await getRecordedSessionData(client, sessionId);
  if (!sessionData) {
    console.error(
      "Error: Could not retrieve session data. This may be an invalid session"
    );
    process.exit(1);
  }

  await writeFile(sessionDataFile, JSON.stringify(sessionData, null, 2));
  console.log(`Wrote session data to ${sessionDataFile}`);
  return sessionData;
};
