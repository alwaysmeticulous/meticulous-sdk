import {
  type AgentSwarmCaseCounts,
  type AgentSwarmCaseSummary,
  type AgentSwarmRunResponse,
  createClientWithOAuth,
  getAgentSwarmRun,
} from "@alwaysmeticulous/client";
import { logNotice } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";
import {
  dontWaitForSwarmRunToCompleteOption,
  requestFinishedSwarmRunResult,
  resolveSwarmRunSelector,
  type SwarmRunSelectorOptions,
  swarmRunSelectorBuilder,
} from "./agent-swarm-run-selector-options";

interface SwarmRunOptions extends SwarmRunSelectorOptions {
  status: string | undefined;
}

const CASE_COLUMNS: ReadonlyArray<{
  header: keyof AgentSwarmCaseSummary;
  value: (testCase: AgentSwarmCaseSummary) => string | undefined;
}> = [
  { header: "caseIndex", value: (testCase) => String(testCase.caseIndex) },
  { header: "status", value: (testCase) => testCase.status },
  { header: "blockedBy", value: (testCase) => testCase.blockedBy },
  { header: "title", value: (testCase) => testCase.title },
  { header: "outcomeSummary", value: (testCase) => testCase.outcomeSummary },
  { header: "takeaway", value: (testCase) => testCase.takeaway },
];

const swarmRunHandler = async (options: SwarmRunOptions): Promise<void> => {
  const target = await resolveSwarmRunSelector(options);
  const client = await createClientWithOAuth({
    apiToken: options.apiToken,
    enableOAuthLogin: true,
  });
  const result = await requestFinishedSwarmRunResult(
    () => getAgentSwarmRun(client, target, { status: options.status }),
    { dontWait: options.dontWaitForSwarmRunToComplete, json: options.json },
  );
  if (result == null) {
    return;
  }
  if (options.json) {
    printJson(result);
  } else {
    printCasesTsv(result.cases);
  }
  logRunNotices(result, options.status);
};

export const agentSwarmRunCommand: CommandModule<unknown, SwarmRunOptions> = {
  command: "agent-swarm-run",
  describe:
    "Get the status and list of cases for a given Agent swarm run (by default the latest execution run for the test run, commit or pull request). Agent swarm is Meticulous's hosted agent that explores a pull request's build in a browser and reports pass/fail/blocked test flows. Outputs a TSV table with columns caseIndex, status, blockedBy, title, outcomeSummary and takeaway (the run summary's headline finding, for at most three cases), and the run's status, case counts, errorMessage, supersededBySwarmRunId and notTestable on stderr. Case status: pass; fail (the app misbehaved — already upheld by an independent failure checker); blocked (could not be verified — blockedBy says whether the application or the test environment stopped it); skipped; or not-started / running in a run that stopped before finishing. notTestable explains a run that deliberately executed no flows. If the run has not finished, blocks until it has, for at most 10 minutes. Use agent agent-swarm-run-case for a case's steps, failure check and fix prompt.",
  builder: {
    ...swarmRunSelectorBuilder,
    status: {
      string: true,
      description:
        "Output only cases with one of these comma-separated statuses: not-started, running, pass, fail, blocked, skipped. counts still cover every case.",
    },
    ...dontWaitForSwarmRunToCompleteOption,
  },
  handler: wrapHandler(swarmRunHandler),
};

const printCasesTsv = (cases: AgentSwarmCaseSummary[]): void => {
  console.log(CASE_COLUMNS.map(({ header }) => header).join("\t"));
  for (const testCase of cases) {
    console.log(
      CASE_COLUMNS.map(({ value }) => toTsvCell(value(testCase))).join("\t"),
    );
  }
};

/** Run-level details, on stderr so stdout stays the case table. */
const logRunNotices = (
  result: AgentSwarmRunResponse,
  statusFilter: string | undefined,
): void => {
  const { run } = result;
  logNotice(
    `Agent swarm run ${run.swarmRunId}: ${run.status} (commit ${run.commitSha})${formatCounts(result.counts)}` +
      (result.supersededBySwarmRunId == null
        ? ""
        : ` — superseded by newer run ${result.supersededBySwarmRunId}`),
  );
  if (run.errorMessage != null) {
    logNotice(`Error: ${run.errorMessage}`);
  }
  if (result.resultWithheld != null) {
    logNotice(
      "This run's result needs source-code access to read, which this caller does not have.",
    );
  }
  if (result.notTestable != null) {
    logNotice(
      `Not testable (${result.notTestable.category}): ${result.notTestable.reason}`,
    );
  }
  // A not-testable run's reason already explains why it has no cases.
  if (
    result.cases.length === 0 &&
    result.resultSource !== "none" &&
    result.notTestable == null
  ) {
    logNotice(
      statusFilter == null
        ? `Agent swarm run ${run.swarmRunId} has no cases.`
        : `Agent swarm run ${run.swarmRunId} has no cases with status ${statusFilter}.`,
    );
  }
};

const formatCounts = (counts: AgentSwarmCaseCounts | undefined): string =>
  counts == null
    ? ""
    : ` — ${counts.total} cases: ${counts.pass} pass, ${counts.fail} fail, ${counts.blocked} blocked` +
      (counts.skipped > 0 ? `, ${counts.skipped} skipped` : "") +
      (counts.running + counts.notStarted > 0
        ? `, ${counts.running} running, ${counts.notStarted} not started`
        : "");

/** Keeps a free-text value on its own row and in its own column. */
const toTsvCell = (value: string | undefined): string =>
  (value ?? "").replace(/\s+/g, " ").trim();
