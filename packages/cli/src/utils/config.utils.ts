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

export const getSimulationIdForAssets = (
  testCase: TestCase,
  useAssetsSnapshottedInBaseSimulation: boolean | null | undefined
): string | undefined => {
  if (testCase.options?.useAssetsFromReplayId) {
    return testCase.options.useAssetsFromReplayId;
  }

  if (useAssetsSnapshottedInBaseSimulation) {
    return testCase.baseReplayId;
  }

  return undefined;
};
