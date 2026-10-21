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
    { outcome: "pass", description: "Open sessions" },
    {
      outcome: "fail",
      description: "Click the error count",
      reason: "Landed on the replay.",
    },
  ],
  comparisons: [],
  mockDataProvenance: {
    recorded: 4,
    modified: 1,
    generated: 0,
    strictRecheck: { performed: true, reproduced: true },
  },
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
  check: {
    verdict: "fail",
    confidence: "high",
    reason: "The row handler wins.",
    headline: "Error counts open the replay.",
    linkedToChange: "yes",
  },
  sessionIds: ["s-1", "s-2"],
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
      "mockDataProvenance:\t4 recorded, 1 modified, 0 generated",
      "mockDataProvenance.strictRecheck.performed:\ttrue",
      "mockDataProvenance.strictRecheck.reproduced:\ttrue",
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

  it("prints each side divergence with its reason, or that it has none", () => {
    const lines = formatSwarmRunCase({
      ...testCase,
      sideDivergences: [
        {
          scope: "actions",
          reason: "The base has no export button",
          detail: "head ran click(#export); base ran click(#download)",
        },
        { scope: "actions", detail: "outside any onSide branch" },
      ],
    });

    expect(lines).toContain(
      "sideDivergences[0]:\tactions: The base has no export button — head ran click(#export); base ran click(#download)",
    );
    expect(lines).toContain(
      "sideDivergences[1]:\tactions: no reason given — outside any onSide branch",
    );
  });

  it("prints the live attempt behind a retry with mocks", () => {
    const lines = formatSwarmRunCase({
      ...testCase,
      status: "pass",
      mockFallback: {
        completed: true,
        liveAttempt: {
          blockedBy: "environment",
          setupIssue: {
            category: "missingTestData",
            summary: "No errors recorded",
            evidence: "The errors list was empty.",
            suggestedFix: "Seed an error for the test project.",
          },
        },
      },
    });

    expect(lines).toEqual(
      expect.arrayContaining([
        "mockFallback.completed:\ttrue",
        "mockFallback.liveAttempt.blockedBy:\tenvironment",
        "mockFallback.liveAttempt.setupIssue:\tmissingTestData: No errors recorded — The errors list was empty. — Seed an error for the test project.",
      ]),
    );
  });

  it("leaves out the fix prompt", () => {
    const text = formatSwarmRunCase(testCase).join("\n");

    expect(text).not.toContain("Fix it.");
  });
});
