import { cosmiconfig } from "cosmiconfig";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { cwd } from "process";
import { MeticulousCliConfig } from "./config.types";

const METICULOUS_CONFIG_FILE = "meticulous.json";

const findConfig: () => Promise<string> = async () => {
  const explorer = cosmiconfig("meticulous", {
    searchPlaces: [METICULOUS_CONFIG_FILE],
  });
  const loaded = await explorer.search(cwd());
  return loaded?.filepath || "";
};

let configFilePath = "";

const getConfigFilePath: () => Promise<string> = async () => {
  if (configFilePath) {
    return configFilePath;
  }
  configFilePath = (await findConfig()) || join(cwd(), METICULOUS_CONFIG_FILE);
  return configFilePath;
};

const validateConfig: (config: MeticulousCliConfig) => MeticulousCliConfig = (
  prevConfig
) => {
  const { testCases, ...rest } = prevConfig;

  const nextTestCases = (testCases || [])
    .map(({ title, sessionId, baseReplayId }) => ({
      title: typeof title === "string" ? title : "",
      sessionId: typeof sessionId === "string" ? sessionId : "",
      baseReplayId: typeof baseReplayId === "string" ? baseReplayId : "",
    }))
    .map(({ title, sessionId, baseReplayId }) => ({
      title: title || `${sessionId} | ${baseReplayId}`,
      sessionId,
      baseReplayId,
    }))
    .filter(({ sessionId, baseReplayId }) => sessionId && baseReplayId);

  return { ...rest, testCases: nextTestCases };
};

export const readConfig: () => Promise<MeticulousCliConfig> = async () => {
  const filePath = await getConfigFilePath();
  const configStr = await readFile(filePath, "utf-8").catch((error) => {
    // Use an empty config object if there is no config file
    if (error instanceof Error && (error as any).code === "ENOENT") {
      return "{}";
    }
    throw error;
  });
  const config: MeticulousCliConfig = JSON.parse(configStr);
  return validateConfig(config);
};

export const saveConfig: (
  config: MeticulousCliConfig
) => Promise<void> = async (config) => {
  const filePath = await getConfigFilePath();
  const configStr = JSON.stringify(config, null, 2);
  await writeFile(filePath, configStr);
};
