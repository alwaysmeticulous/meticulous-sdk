import { readConfig, saveConfig } from "../config/config";
import { MeticulousCliConfig, TestCase } from "../config/config.types";

export const addTestCase: (testCase: TestCase) => Promise<void> = async (
  testCase
) => {
  const meticulousConfig = await readConfig();
  const newConfig: MeticulousCliConfig = {
    ...meticulousConfig,
    testCases: [...(meticulousConfig.testCases || []), testCase],
  };
  await saveConfig(newConfig);
};
