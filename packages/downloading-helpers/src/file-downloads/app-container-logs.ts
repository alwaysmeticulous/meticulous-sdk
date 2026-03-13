import { appendFile, mkdir } from "fs/promises";
import { join } from "path";
import { AppContainerLogsLocations } from "@alwaysmeticulous/api";
import { initLogger } from "@alwaysmeticulous/common";

export const downloadAppContainerLogs = async (
  appContainerLogs: AppContainerLogsLocations,
  testRunDir: string,
): Promise<void> => {
  const logger = initLogger();

  if (appContainerLogs.pods.length === 0) {
    logger.warn("No app container logs found for this test run.");
    return;
  }

  const logsDir = join(testRunDir, "app-container-logs");
  await mkdir(logsDir, { recursive: true });

  await Promise.all(
    appContainerLogs.pods.map(async ({ podName, chunkKeys }) => {
      await downloadPodLogs({
        podName,
        chunkKeys,
        signedBaseUrl: appContainerLogs.signedBaseUrl,
        logsDir,
      });
      logger.info(`Downloaded app container logs for ${podName}`);
    }),
  );
};

const downloadPodLogs = async ({
  podName,
  chunkKeys,
  signedBaseUrl,
  logsDir,
}: {
  podName: string;
  chunkKeys: string[];
  signedBaseUrl: string;
  logsDir: string;
}): Promise<void> => {
  // The S3 objects have both Content-Type: application/gzip and Content-Encoding: gzip set,
  // so fetch automatically decompresses the response body. We save as .log (not .log.gz).
  const outputPath = join(logsDir, `${podName}.log`);
  for (const chunkKey of chunkKeys) {
    const url = buildChunkUrl(signedBaseUrl, chunkKey);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Failed to download log chunk for pod ${podName}: ${response.status} ${response.statusText}`,
      );
    }
    await appendFile(outputPath, Buffer.from(await response.arrayBuffer()));
  }
};

const buildChunkUrl = (signedBaseUrl: string, chunkKey: string): string => {
  const url = new URL(signedBaseUrl);
  url.pathname = `/${chunkKey}`;
  return url.toString();
};
