import { TestRunStatus } from "@alwaysmeticulous/api";
import { ContainerEnvVariable } from "@alwaysmeticulous/client";

/**
 * The full union of options accepted by {@link triggerTestRun}. The upload mode
 * (static assets vs Docker container) is auto-detected from which inputs are
 * provided: `localImageTag` selects container mode, `appDirectory`/`appZip`
 * select asset mode.
 */
export interface TriggerTestRunOptions {
  apiToken?: string | null | undefined;

  // Git context (custom test run trigger)
  commitSha?: string | undefined;
  baseSha?: string | undefined;
  gitDiffOutput?: string | undefined;
  repoDirectory?: string | undefined;

  // Asset upload mode
  appDirectory?: string | undefined;
  appZip?: string | undefined;
  /** URL rewrite rules as a JSON array string (asset mode only). */
  rewrites?: string | undefined;

  // Container upload mode
  localImageTag?: string | undefined;
  containerPort?: number | undefined;
  containerEnv?: ContainerEnvVariable[] | undefined;
  containerHealthCheckEndpoint?: string | undefined;

  // Common
  waitForBase: boolean;
  waitForTestRunToComplete: boolean;
  dryRun?: boolean | undefined;
}

export interface TriggerTestRunResult {
  testRunId: string | null;
  status: TestRunStatus | null;
}
