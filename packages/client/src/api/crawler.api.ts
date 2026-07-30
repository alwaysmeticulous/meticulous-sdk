import type { TestCase } from "@alwaysmeticulous/api";
import { isFetchError } from "../errors";
import type { MeticulousClient } from "../types/client.types";

export interface CrawlerTestRun {
  id: string;
  status: string;

  /**
   * The test cases included in the test run. This may cover fewer sessions than
   * requested: sessions that don't belong to the project or haven't finished
   * ingesting are filtered out.
   */
  configData: {
    testCases?: TestCase[];
  };

  /**
   * URL of the test run in the Meticulous web app.
   */
  url: string;
}

/**
 * Creates a test run from sessions recorded by a crawl. The project is derived
 * from the API token the client is authenticated with (or from `projectId` for
 * user-scoped OAuth tokens), and only sessions belonging to that project are
 * included.
 */
export const createCrawlerTestRun = async ({
  client,
  sessionIds,
  appUrl,
  projectId,
}: {
  client: MeticulousClient;
  sessionIds: string[];
  appUrl: string;
  projectId?: string | null | undefined;
}): Promise<CrawlerTestRun> => {
  const { data } = await client
    .post<unknown, { data: CrawlerTestRun }>("crawler/test-runs", {
      sessionIds,
      appUrl,
      ...(projectId ? { projectId } : {}),
    })
    .catch((error) => {
      if (isFetchError(error)) {
        const errorMessage = error.response?.data?.message;

        if (errorMessage) {
          throw new Error(errorMessage);
        }
      }

      throw error;
    });

  return data;
};
