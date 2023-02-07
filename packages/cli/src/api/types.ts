import { TestCaseResult } from "../config/config.types";

interface Organization {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface Project {
  id: string;
  name: string;
  recordingToken: string;
  apiToken: string;
  isGitHubIntegrationActive: boolean;
  url: string;

  organization: Organization;

  createdAt: string;
  updatedAt: string;
}

export type TestRunStatus = "Running" | "Success" | "Failure";

export interface TestRun {
  id: string;
  status: TestRunStatus;
  project: Project;
  resultData?: {
    results: TestCaseResult[];
    [key: string]: any;
  };
  [key: string]: any;
}
