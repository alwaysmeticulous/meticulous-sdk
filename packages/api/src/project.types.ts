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
  settings: {
    networkStubbingMode?: NetworkStubbingMode;
    defaultScreenshottingOptions?: ProjectSettingsScreenshottingOptions;
  };

  experimentValues: Record<string, string>;
}

export type ProjectSettingsScreenshottingOptions = Partial<
  Pick<
    ScreenshottingEnabledOptions,
    | "waitBeforeScreenshotsMs"
    | "captureFullPage"
    | "elementsToIgnore"
    | "waitForBaseToMatch"
  >
>;
