import {
  StructuredSessionSummary,
  getStructuredSessionData,
  MeticulousClient,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import { writeStructuredSessionData } from "@alwaysmeticulous/downloading-helpers";

export const downloadSingleSession = async (
  client: MeticulousClient,
  sessionId: string,
  outputDir: string,
  logger: ReturnType<typeof initLogger>,
): Promise<StructuredSessionSummary | null> => {
  try {
    const sessionData = await getStructuredSessionData(client, sessionId);
    await writeStructuredSessionData({ outputDir, sessionData });
    logger.info(`  Downloaded session ${sessionId}`);
    return sessionData.summary;
  } catch (error) {
    logger.error(`  Failed to download session ${sessionId}: ${error}`);
    return null;
  }
};
