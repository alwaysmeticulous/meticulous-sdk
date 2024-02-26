import { Project } from "../project.types";

export interface Replay {
  id: string;
  project: Project;
  version: "v3";
}
