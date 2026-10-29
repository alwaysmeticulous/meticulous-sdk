import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEBUG_DATA_DIRECTORY } from "../debug-constants";
import { generateFilteredLogs } from "../generate-debug-workspace";

describe("generateFilteredLogs noise filtering", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "met-filtered-logs-"));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  const filter = (line: string): string => {
    const replayDir = join(
      workspace,
      DEBUG_DATA_DIRECTORY,
      "replays",
      "head",
      "replay-1",
    );
    mkdirSync(replayDir, { recursive: true });
    writeFileSync(join(replayDir, "logs.deterministic.txt"), line);
    generateFilteredLogs(workspace);
    return readFileSync(
      join(replayDir, "logs.deterministic.filtered.txt"),
      "utf8",
    );
  };

  it("replaces quoted IDs and hashes", () => {
    expect(filter('Loaded "a1B2c3D4e5F6g7H8i9J0k1"')).toBe('Loaded "<NOISE>"');
  });

  it("keeps long identifiers without digits", () => {
    expect(filter('Raw tool part {"type":"tool-read_current_page"}')).toBe(
      'Raw tool part {"type":"tool-read_current_page"}',
    );
  });
});
