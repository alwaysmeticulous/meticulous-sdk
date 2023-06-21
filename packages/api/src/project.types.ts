import { Organization } from "./organization.types";
import { TestCase } from "./replay/test-run.types";
import { NetworkStubbingMode } from "./sdk-bundle-api/sdk-to-bundle/network-stubbing";

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
  };
}

export interface ProjectConfigurationData {
  testCases?: TestCase[];
}
