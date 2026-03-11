import { TestCase } from "@alwaysmeticulous/api";
import { isFetchError, maybeEnrichFetchError } from "../errors";
import { MeticulousClient } from "../types/client.types";

export interface GetRelevantSessionsParams {
  projectId: string;
  baseCommitSha: string;
  editedFilesWithLines: EditedFileWithLines[];
}

export interface EditedFileWithLines {
  filePath: string;
  editedRanges: CompactRange[];
}

export type CompactRange = [number, number];

export type GetRelevantSessionsResponse = {
  baseTestRunId?: string;
  baseTestRunUrl?: string;
  testCases: RelevantSession[];
  error?: string;
};

export type RelevantSession = TestCase & {
  description: string | null;
};

export const getRelevantSessions = async (
  client: MeticulousClient,
  params: GetRelevantSessionsParams,
): Promise<GetRelevantSessionsResponse> => {
  const { data } = await client
    .post<
      unknown,
      { data: GetRelevantSessionsResponse }
    >("local-changes/relevant-sessions", params)
    .catch((error) => {
      if (isFetchError(error) && error.response?.status === 404) {
        return {
          data: {
            testCases: [],
            error: error.response?.data?.message ?? error.message,
          },
        };
      }
      throw maybeEnrichFetchError(error);
    });
  return data;
};
