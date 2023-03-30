import { TestCase } from "@alwaysmeticulous/api";
import { ReplayTarget } from "@alwaysmeticulous/sdk-bundles-api";

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
