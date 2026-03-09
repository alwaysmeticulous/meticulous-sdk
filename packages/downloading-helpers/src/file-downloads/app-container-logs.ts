import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { AppContainerLogsLocations } from "@alwaysmeticulous/api";
import { initLogger } from "@alwaysmeticulous/common";

const buildChunkUrl = (signedBaseUrl: string, chunkKey: string): string => {
  const url = new URL(signedBaseUrl);
  url.pathname = `/${chunkKey}`;
  return url.toString();
};

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
      const chunks = await Promise.all(
        chunkKeys.map(async (key) => {
          const url = buildChunkUrl(appContainerLogs.signedBaseUrl, key);
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(
              `Failed to download log chunk for pod ${podName}: ${response.status} ${response.statusText}`,
            );
          }
          return Buffer.from(await response.arrayBuffer());
        }),
      );
      const logContent = Buffer.concat(chunks);
      await writeFile(join(logsDir, `${podName}.log.gz`), logContent);
      logger.info(`Downloaded app container logs for ${podName}`);
    }),
  );
};
