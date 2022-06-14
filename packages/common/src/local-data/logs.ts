import { mkdir } from "fs/promises";
import { join } from "path";
import { getMeticulousLocalDataDir } from "./local-data";

export const getLogFile: (invocationId: string) => Promise<string> = async (
  invocationId
) => {
  const logsDir = join(getMeticulousLocalDataDir(), "logs");
  await mkdir(logsDir, { recursive: true });
  const logFile = join(logsDir, `${invocationId}.log`);
  return logFile;
};
