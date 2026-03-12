import { isFetchError, maybeEnrichFetchError } from "../errors";
import { MeticulousClient } from "../types/client.types";

export interface ReplayDiffResponse {
  id: string;
  project?: {
    id?: string;
    name?: string;
    organization?: { name?: string };
  };
  headReplay: {
    id: string;
    sessionId?: string;
    commitSha?: string;
    meticulousSha?: string;
    projectId?: string;
  };
  baseReplay: {
    id: string;
    sessionId?: string;
    commitSha?: string;
    meticulousSha?: string;
  };
  testRun?: {
    id?: string;
    status?: string;
  };
  data?: {
    screenshotDiffResults?: Array<{
      identifier?: unknown;
      outcome?: string;
      diffToBaseScreenshot?: {
        width?: number;
        height?: number;
        outcome?: string;
        mismatchPixels?: number;
        mismatchFraction?: number;
        diffFullFile?: string;
        changedSectionsClassNames?: string[];
      };
    }>;
    screenshotAssertionsOptions?: unknown;
  };
  createdAt?: string;
  updatedAt?: string;
}

export const getReplayDiff = async (
  client: MeticulousClient,
  replayDiffId: string,
): Promise<ReplayDiffResponse | null> => {
  const { data } = await client
    .get(`replay-diffs/${replayDiffId}`)
    .catch((error) => {
      if (isFetchError(error) && error.response?.status === 404) {
        return { data: null };
      }
      throw maybeEnrichFetchError(error);
    });
  return data;
};
