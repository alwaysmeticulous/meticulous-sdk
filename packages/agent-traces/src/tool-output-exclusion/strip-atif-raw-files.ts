import { validateAtifTrajectory } from "../atif/validate-atif-trajectory";
import type { AgentTraceRawFile } from "../types/raw-envelope.types";
import { rewriteJsonFile } from "./rewrite-raw-file";
import { stripAtifToolOutputs } from "./strip-atif-tool-outputs";
import type { ToolOutputFilter } from "./tool-output-filter";

/** For raw files that are themselves ATIF trajectories. */
export const stripAtifRawFiles = (
  files: AgentTraceRawFile[],
  filter: ToolOutputFilter,
): AgentTraceRawFile[] =>
  files.map((file) =>
    rewriteJsonFile(file, (value) => {
      const { trajectory } = validateAtifTrajectory(value);
      if (!trajectory) {
        return false;
      }
      const before = JSON.stringify(trajectory);
      Object.assign(trajectory, stripAtifToolOutputs(trajectory, filter));
      return JSON.stringify(trajectory) !== before;
    }),
  );
