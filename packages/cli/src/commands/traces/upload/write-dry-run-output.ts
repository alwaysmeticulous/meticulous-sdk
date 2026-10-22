import type {
  AgentTraceAgent,
  AgentTraceSummary,
  PreparedSessionUpload,
} from "@alwaysmeticulous/agent-traces";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { gunzipSync } from "zlib";

/** Writes `<outputDir>/<agent>/<sessionId>/{trajectory.atif,raw,summary}.json`. */
export const writeDryRunOutput = async ({
  outputDir,
  agent,
  sessionId,
  prepared,
  summary,
}: {
  outputDir: string;
  agent: AgentTraceAgent;
  sessionId: string;
  prepared: PreparedSessionUpload;
  summary: AgentTraceSummary;
}): Promise<string> => {
  const dir = join(outputDir, agent, sessionId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "trajectory.atif.json"), prepared.atifJson);
  await writeFile(join(dir, "raw.json"), gunzipSync(prepared.rawGzipped));
  await writeFile(
    join(dir, "summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  return dir;
};
