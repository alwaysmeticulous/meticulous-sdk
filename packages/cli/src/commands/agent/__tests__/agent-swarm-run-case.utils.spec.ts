import type { AgentSwarmCaseResponse } from "@alwaysmeticulous/client";
import { describe, expect, it } from "vitest";
import { formatSwarmRunCase } from "../agent-swarm-run-case.utils";

const testCase: AgentSwarmCaseResponse = {
  swarmRunId: "run-1",
  caseIndex: 2,
  title: "Open errors scoped to a session",
  status: "fail",
  outcomeSummary: "Opens the replay\ninstead of the errors view.",
  steps: [
    {
      stepIndex: 0,
      description: "Open sessions",
      outcome: "pass",
      setup: true,
    },
    {
      stepIndex: 1,
      description: "Click the error count",
      outcome: "fail",
      reason: "Landed on the replay.",
      setup: false,
    },
  ],
  runEvidence: {
    backendFailures: [
      {
        kind: "http-error",
        method: "GET",
        endpoint: "api.example.com/errors",
        status: 500,
        count: 3,
      },
    ],
    backendFailureCount: 3,
    pageErrors: ["TypeError: x is undefined"],
  },
  compareWithBase: false,
  comparisons: [],
  check: {
    originalOutcome: "fail",
    verdict: "fail",
    confidence: "high",
    reason: "The row handler wins.",
    headline: "Error counts open the replay.",
    linkedToChange: "yes",
  } as NonNullable<AgentSwarmCaseResponse["check"]>,
  sessionIds: ["s-1", "s-2"],
  baseSessionIds: [],
  url: "https://app.example/case",
  fixPrompt: "Fix it.",
};

describe("formatSwarmRunCase", () => {
  it("prints one key:value line per present field, keyed by its JSON path", () => {
    expect(formatSwarmRunCase(testCase)).toEqual([
      "swarmRunId:\trun-1",
      "caseIndex:\t2",
      "title:\tOpen errors scoped to a session",
      "status:\tfail",
      "outcomeSummary:\tOpens the replay instead of the errors view.",
      "steps[0]:\tpass — Open sessions",
      "steps[1]:\tfail — Click the error count — Landed on the replay.",
      "runEvidence.backendFailureCount:\t3",
      "runEvidence.backendFailures[0]:\tGET api.example.com/errors: http-error 500 (x3)",
      "runEvidence.pageErrors[0]:\tTypeError: x is undefined",
      "check.verdict:\tfail",
      "check.confidence:\thigh",
      "check.headline:\tError counts open the replay.",
      "check.reason:\tThe row handler wins.",
      "check.linkedToChange:\tyes",
      "sessionIds:\ts-1,s-2",
    ]);
  });

  it("leaves out the url and fix prompt", () => {
    const text = formatSwarmRunCase(testCase).join("\n");

    expect(text).not.toContain("https://app.example/case");
    expect(text).not.toContain("Fix it.");
  });
});
