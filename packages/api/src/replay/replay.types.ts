import { Project } from "../project.types";

export interface Replay {
  id: string;
  project: Project;
  version: "v1" | "v2" | "v3";
}
