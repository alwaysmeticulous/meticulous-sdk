import { ReplayTarget } from "@alwaysmeticulous/common/dist/types/replay.types";
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

export const getReplayTargetForTestCase = ({
  useAssetsSnapshottedInBaseSimulation,
  appUrl,
  baseReplayId,
}: {
  useAssetsSnapshottedInBaseSimulation: boolean;
  appUrl: string | undefined;
  baseReplayId: string;
}): ReplayTarget => {
  if (useAssetsSnapshottedInBaseSimulation) {
    return { type: "snapshotted-assets", simulationIdForAssets: baseReplayId };
  }
  if (appUrl) {
    return { type: "url", appUrl };
  }
  return { type: "original-recorded-url" };
};
