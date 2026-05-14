import { SessionData } from "@alwaysmeticulous/api";
import { isFetchError, maybeEnrichFetchError } from "../errors";
import { MeticulousClient } from "../types/client.types";

export const getRecordedSession = async (
  client: MeticulousClient,
  sessionId: string,
): Promise<any> => {
  const { data } = await client.get(`sessions/${sessionId}`).catch((error) => {
    if (isFetchError(error) && error.response?.status === 404) {
      return { data: null };
    }

    throw maybeEnrichFetchError(error);
  });
  return data;
};

export const getRecordedSessionData = async (
  client: MeticulousClient,
  sessionId: string,
): Promise<SessionData> => {
  const { data } = await client
    .get(`sessions/${sessionId}/data`)
    .catch((error) => {
      if (isFetchError(error) && error.response?.status === 404) {
        return { data: null };
      }

      throw maybeEnrichFetchError(error);
    });
  return data;
};

export const getRecordingCommandId = async (
  client: MeticulousClient,
  projectId?: string,
): Promise<string> => {
  const { data } = await client.post(
    "sessions/start",
    undefined,
    projectId ? { params: { projectId } } : undefined,
  );
  const { recordingCommandId } = data as { recordingCommandId: string };
  return recordingCommandId;
};

export const postSessionIdNotification = async (
  client: MeticulousClient,
  sessionId: string,
  recordingCommandId: string,
  projectId?: string,
): Promise<void> => {
  await client.post(
    `sessions/${sessionId}/notify`,
    { recordingCommandId },
    projectId ? { params: { projectId } } : undefined,
  );
};
