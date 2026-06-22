import type { SessionData } from "@alwaysmeticulous/api";
import { isFetchError, maybeEnrichFetchError } from "../errors";
import type { MeticulousClient } from "../types/client.types";

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

export interface BackendReplayEnvVariable {
  name: string;
  value: string;
}

/**
 * Fetches the env vars that put the backend recorder into replay mode and
 * point it at the session's recorded data (presigned URLs). Returns an empty
 * array for non-backend sessions. Used by `simulate` against an uploaded
 * container to mock the backend's outbound calls.
 */
export const getBackendReplayEnv = async ({
  client,
  sessionId,
}: {
  client: MeticulousClient;
  sessionId: string;
}): Promise<BackendReplayEnvVariable[]> => {
  const { data } = await client
    .get<unknown, { data: BackendReplayEnvVariable[] }>(
      `sessions/${sessionId}/backend-replay-env`,
    )
    .catch((error) => {
      if (isFetchError(error) && error.response?.status === 404) {
        return { data: [] };
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
