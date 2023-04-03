import { fetchAsset } from "@alwaysmeticulous/downloading-helpers";
import {
  ExecuteTestRunOptions,
  ExecuteTestRunResult,
  ReplayAndStoreResultsOptions,
  ReplayExecution,
} from "@alwaysmeticulous/sdk-bundles-api";

// TODO: Update CLI to use these functions instead

export const replayAndStoreResults = async (
  options: ReplayAndStoreResultsOptions
): Promise<ReplayExecution> => {
  return (await loadReplayOrchestratorBundle()).replayAndStoreResults(options);
};

export const executeTestRun = async (
  options: ExecuteTestRunOptions
): Promise<ExecuteTestRunResult> => {
  return (await loadReplayOrchestratorBundle()).executeTestRun(options);
};

const loadReplayOrchestratorBundle = async (): Promise<any> => {
  const replayOrchestratorBundleLocation = await fetchAsset(
    "replay/v3/replay-orchestrator.bundle.js"
  );
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require(replayOrchestratorBundleLocation);
};
