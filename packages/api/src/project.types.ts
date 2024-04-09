import { Organization } from "./organization.types";
import { TestCase } from "./replay/test-run.types";
import { NetworkStubbingMode } from "./sdk-bundle-api/sdk-to-bundle/network-stubbing";
import { ScreenshottingEnabledOptions } from "./sdk-bundle-api/sdk-to-bundle/screenshotting-options";

export interface Project {
  id: string;
  organization: Organization;
  name: string;
  recordingToken: string;
  configurationData: ProjectConfigurationData;
  createdAt: string;
  updatedAt: string;
  isGitHubIntegrationActive?: boolean;
  settings: {
    networkStubbingMode?: NetworkStubbingMode;
    defaultScreenshottingOptions?: ProjectSettingsScreenshottingOptions;
  };
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

export interface ProjectConfigurationData {
  testCases?: TestCase[];
}
