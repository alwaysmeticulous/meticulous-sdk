import { Organization } from "./organization.types";
import { TestCase } from "./replay/test-run.types";

export interface Project {
  id: string;
  organization: Organization;
  name: string;
  recordingToken: string;
  apiToken: string;
  configurationData: ProjectConfigurationData;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectConfigurationData {
  testCases?: TestCase[];
}
