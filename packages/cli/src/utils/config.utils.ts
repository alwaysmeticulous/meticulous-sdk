import { TestCase } from "@alwaysmeticulous/api";
import { ReplayTarget } from "@alwaysmeticulous/common/dist/types/replay.types";
import { readConfig, saveConfig } from "../config/config";
import { MeticulousCliConfig } from "../config/config.types";

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

export const getReplayTargetForTestCase = ({
  appUrl,
  testCase,
}: {
  appUrl: string | null;
  testCase: TestCase;
}): ReplayTarget => {
  if (testCase.options?.simulationIdForAssets != null) {
    return {
      type: "snapshotted-assets",
      simulationIdForAssets: testCase.options?.simulationIdForAssets,
    };
  }

  if (testCase.options?.appUrl) {
    if (appUrl) {
      throw new Error(
        `Test cases "${testCase.title}" has an "appUrl" option but --appUrl is also provided.`
      );
    }

    return { type: "url", appUrl: testCase.options.appUrl };
  }
  if (appUrl) {
    return { type: "url", appUrl };
  }
  return { type: "original-recorded-url" };
};
