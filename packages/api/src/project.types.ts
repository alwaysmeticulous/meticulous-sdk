import { Organization } from "./organization.types";
import { NetworkStubbingMode } from "./sdk-bundle-api/sdk-to-bundle/network-stubbing";
import { ScreenshottingEnabledOptions } from "./sdk-bundle-api/sdk-to-bundle/screenshotting-options";

export interface Project {
  id: string;
  organization: Organization;
  name: string;
  recordingToken: string;
  createdAt: string;
  updatedAt: string;
  isGitHubIntegrationActive?: boolean;
  isMonitoringEnabled: boolean;
  /**
   * When `true`, the project gets its source code from customer-uploaded
   * archives (via `meticulous project upload-source`) instead of by
   * `git clone`. Consumers that need source code (e.g. the cloud worker's
   * clone-and-parse step) MUST dispatch on this flag — calling
   * `getRepoUrl` on a `usesSourceCodeUploads` project returns 403, and
   * calling `getSourceArchiveUrl` on a non-`usesSourceCodeUploads` project
   * also returns 403.
   *
   * Optional for backward compatibility with older backends that don't
   * populate it (treat absent as `false`).
   */
  usesSourceCodeUploads?: boolean;
  settings: {
    networkStubbingMode?: NetworkStubbingMode;
    defaultScreenshottingOptions?: ProjectSettingsScreenshottingOptions;
    pathsToIncludeInCoverage?: string[];
    pathsToExcludeFromCoverage?: string[];
    perScreenshotCoveragePostProcessing?:
      | "all-screenshots"
      | "diffs-only"
      | null;
    externalHostsToConsiderAppRelated?: string[];
    disableSourceMapLoading?: boolean;
    assumeSourceMapEnabledForAllFiles?: boolean;
  };

  experimentValues: Record<string, string>;
}

export type ProjectSettingsScreenshottingOptions = Partial<
  Pick<
    ScreenshottingEnabledOptions,
    "waitBeforeScreenshotsMs" | "captureFullPage" | "elementsToIgnore"
  >
>;
