import type { Identity, TraceSession } from "@alwaysmeticulous/agent-traces";
import { existsSync, mkdtempSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { processTraceSession } from "../process-trace-session";

const identity: Identity = {
  userEmail: "alice@example.com",
  gitRemoteUrl: null,
  gitRepository: null,
  osUsername: "alice",
  hostname: "laptop",
  platform: "linux",
  osRelease: null,
  timeZone: null,
  environment: "local",
  environmentId: "workspace-1",
};

const session: TraceSession = {
  agent: "other",
  sessionId: "s1",
  sourcePaths: ["/traces/s1.json"],
  prepare: () =>
    Promise.resolve({
      envelope: {
        envelopeVersion: 1,
        agent: "other",
        sessionId: "s1",
        projectDirName: null,
        rawFormat: "atif",
        files: [],
      },
      trajectory: {
        schema_version: "ATIF-v1.7",
        agent: { name: "harness", version: "1" },
        steps: [{ step_id: 1, source: "user", message: "hi" }],
      },
      stats: {
        cwd: null,
        gitBranch: null,
        gitBranches: [],
        pullRequests: [],
        agentVersion: null,
        entrypoint: null,
        permissionModes: [],
        title: "hi",
        models: [],
        startedAt: null,
        endedAt: null,
        stepCount: 1,
        subagentCount: 0,
        totals: {
          promptTokens: 0,
          completionTokens: 0,
          cachedTokens: 0,
          cacheCreationTokens: 0,
        },
        reportedCostUsd: null,
        activity: {
          userPromptCount: 1,
          compactionCount: 0,
          toolCallCount: 0,
          toolErrorCount: 0,
          toolCallCounts: [],
        },
      },
    }),
};

const context = (outputDir: string | null) => ({
  target: { kind: "dry-run" as const, outputDir },
  excludeToolOutputRegexes: [],
  resolveIdentity: () => identity,
  uploaderVersion: "cli-1.0.0",
});

describe("processTraceSession", () => {
  it("writes a dry run's payloads, marking the summary as imported", async () => {
    const outputDir = mkdtempSync(join(tmpdir(), "traces-dry-run-"));

    const result = await processTraceSession(session, context(outputDir));

    const dir = join(outputDir, "other", "s1");
    expect(result).toMatchObject({
      stepCount: 1,
      subagentCount: 0,
      outcome: { kind: "converted", outputDir: dir },
    });
    expect(existsSync(join(dir, "trajectory.atif.json"))).toBe(true);
    expect(
      JSON.parse(readFileSync(join(dir, "raw.json"), "utf8")),
    ).toMatchObject({
      agent: "other",
      rawFormat: "atif",
    });
    expect(
      JSON.parse(readFileSync(join(dir, "summary.json"), "utf8")),
    ).toMatchObject({
      userEmail: "alice@example.com",
      environment: "imported",
      environmentId: null,
      uploaderVersion: "cli-1.0.0",
    });
  });

  it("reports a session that can't be converted as failed", async () => {
    const result = await processTraceSession(
      { ...session, prepare: () => Promise.reject(new Error("bad file")) },
      context(null),
    );

    expect(result).toMatchObject({
      stepCount: null,
      outcome: { kind: "failed", reason: "bad file" },
    });
  });
});
