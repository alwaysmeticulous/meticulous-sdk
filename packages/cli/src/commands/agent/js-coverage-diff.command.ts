import type {
  MeticulousClient,
  TestRunJsCoverageDiffResponse,
} from "@alwaysmeticulous/client";
import {
  createClientWithOAuth,
  getReplayDiffJsCoverage,
  getTestRunJsCoverageDiff,
} from "@alwaysmeticulous/client";
import { initLogger, logNotice } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { CliUserError } from "../../utils/cli-user-error";
import { formatCoverageRanges } from "../../utils/format-coverage-ranges";
import { withBaseRunRejectionAsUserError } from "./coverage-rejection.util";
import { resolveFinishedCoverageRuns } from "./coverage-run-resolution.util";
import { coerceLimit, coerceOffset } from "./paging-options.utils";
import { logResponseNotes } from "./response-notes.utils";

interface Options {
  apiToken?: string | null | undefined;
  replayDiffId: string | undefined;
  screenshotName: string | undefined;
  testRunId: string | undefined;
  commitSha: string | undefined;
  project?: string | undefined;
  globFilter: string[] | undefined;
  summary: boolean;
  /**
   * Deliberately without a yargs default, as on `js-coverage`: the backend
   * applies the default page size when none is sent, so an unset value stays
   * distinguishable from an explicit one.
   */
  limit: number | undefined;
  offset: number | undefined;
  dontWaitForTestRunToComplete: boolean;
  json: boolean;
}

const handler = async (options: Options): Promise<void> => {
  const { apiToken, replayDiffId, json } = options;
  initLogger();

  assertScopeCoherent(options);

  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });

  if (replayDiffId != null) {
    await printReplayDiffCoverageDiff(client, replayDiffId, options);
    return;
  }

  // The run to report on: --testRunId, else --commitSha, else the local
  // checkout's HEAD — the same resolution `js-coverage` uses. Its coverage
  // exists only once it has finished, so block until it has.
  const runs = await resolveFinishedCoverageRuns(client, {
    testRunId: options.testRunId,
    commitSha: options.commitSha,
    testRunIds: undefined,
    headPlusTestRunIds: undefined,
    project: options.project,
    dontWaitForTestRunToComplete: options.dontWaitForTestRunToComplete,
  });
  if (runs == null) {
    // Unfinished run, with --dontWaitForTestRunToComplete. The two output
    // shapes need different empty forms, matching `js-coverage`:
    //
    // - the per-file list keeps its shape (a header-only table / an empty
    //   list), since an empty list of differing files is a coherent value;
    // - `--summary` has no meaningful empty shape — a zeroed delta would read
    //   as "this commit changed no coverage" rather than "not ready yet" — so
    //   JSON gets an explicit `null` and human output nothing at all.
    //
    // The reason is on stderr either way, from `resolveFinishedCoverageRuns`.
    if (options.summary) {
      if (json) {
        printJson(null);
      }
      return;
    }
    if (json) {
      printJson([]);
    } else {
      console.log(
        ["repoFilePath", "status", "baseRanges", "headRanges"].join("\t"),
      );
    }
    return;
  }

  const result = await withBaseRunRejectionAsUserError(() =>
    getTestRunJsCoverageDiff(client, runs.testRunId, {
      ...(options.globFilter != null ? { globFilter: options.globFilter } : {}),
      // The per-file rows are discarded below, so don't ask for them: on a
      // large repo they are almost the whole response.
      ...(options.summary ? { summaryOnly: true } : {}),
      ...(options.limit != null ? { limit: options.limit } : {}),
      ...(options.offset != null ? { offset: options.offset } : {}),
    }),
  );

  if (options.summary) {
    printDelta(result, json);
    return;
  }
  printTestRunDiffRows(result, json, options.offset);
};

/**
 * The two scopes are alternatives: one replay pair, or a whole test run against
 * its own base. The whole-run scope needs no flag of its own — it is what a
 * bare invocation does, on the current checkout's run — so this only rejects
 * flags belonging to the scope that wasn't chosen.
 */
export const assertScopeCoherent = (options: Options): void => {
  const { replayDiffId } = options;
  if (replayDiffId != null) {
    const wholeRunOnly = (
      [
        ["testRunId", options.testRunId != null],
        ["commitSha", options.commitSha != null],
        ["summary", options.summary],
        ["dontWaitForTestRunToComplete", options.dontWaitForTestRunToComplete],
      ] as const
    )
      .filter(([, enabled]) => enabled)
      .map(([name]) => `--${name}`);
    if (wholeRunOnly.length > 0) {
      throw new CliUserError(
        `${wholeRunOnly.join(", ")} only appl${wholeRunOnly.length === 1 ? "ies" : "y"} to a whole-test-run diff, not --replayDiffId.`,
      );
    }
    return;
  }
  if (options.screenshotName != null) {
    throw new CliUserError("--screenshotName only applies to --replayDiffId.");
  }
  // --testRunId and --commitSha are two ways to name the same run, as on
  // `js-coverage`; passing both is ambiguous.
  if (options.testRunId != null && options.commitSha != null) {
    throw new CliUserError("Pass either --testRunId or --commitSha, not both.");
  }
  // `--summary` returns one row of totals, so there is nothing to page.
  // Rejected rather than ignored, as on `js-coverage --summary`.
  if (options.summary) {
    const paging = (
      [
        ["limit", options.limit != null],
        ["offset", options.offset != null],
      ] as const
    )
      .filter(([, enabled]) => enabled)
      .map(([name]) => `--${name}`);
    if (paging.length > 0) {
      throw new CliUserError(
        `--summary cannot be combined with: ${paging.join(", ")}. It reports one set of aggregate totals over every file, with no per-file rows to paginate.`,
      );
    }
  }
};

const printTestRunDiffRows = (
  result: TestRunJsCoverageDiffResponse,
  json: boolean,
  offset: number | undefined,
): void => {
  // The response omits `diff` only for a `summaryOnly` request, which this
  // path never makes.
  const diff = result.diff ?? [];
  if (json) {
    printJson(
      diff.map((d) => ({
        repoFilePath: d.filePath,
        status: d.status,
        baseRanges: d.baseRanges,
        headRanges: d.headRanges,
      })),
    );
  } else {
    console.log(
      ["repoFilePath", "status", "baseRanges", "headRanges"].join("\t"),
    );
    for (const d of diff) {
      console.log(
        [
          d.filePath,
          d.status,
          formatCoverageRanges(d.baseRanges),
          formatCoverageRanges(d.headRanges),
        ].join("\t"),
      );
    }
  }

  const { delta } = result;
  logNotice(
    `${delta.files} files with coverage changes ` +
      `(${delta.filesAdded} added, ${delta.filesRemoved} removed, ${delta.filesModified} modified); ` +
      `${delta.uniqueLinesAdded} lines newly covered, ${delta.regressedLines} no longer covered`,
  );
  logResponseNotes(result);
};

// Key-value lines, as `js-coverage --summary` prints — a fixed set of named
// fields rather than a table.
const printDelta = (
  result: TestRunJsCoverageDiffResponse,
  json: boolean,
): void => {
  const summary = {
    testRunId: result.testRunId,
    baseTestRunId: result.baseTestRunId,
    executionSha: result.executionSha,
    baseExecutionSha: result.baseExecutionSha,
    ...result.delta,
  };
  if (json) {
    printJson(summary);
  } else {
    for (const [key, value] of Object.entries(summary)) {
      console.log(`${key}:\t${value}`);
    }
  }
};

const printReplayDiffCoverageDiff = async (
  client: MeticulousClient,
  replayDiffId: string,
  { screenshotName, globFilter, json, limit, offset }: Options,
): Promise<void> => {
  const result = await getReplayDiffJsCoverage(
    client,
    replayDiffId,
    screenshotName,
    {
      globFilter,
      ...(limit != null ? { limit } : {}),
      ...(offset != null ? { offset } : {}),
    },
  );

  // Counted over the whole diff by the backend, so the summary stays truthful
  // when these rows are one page of it. An older backend doesn't send them,
  // and doesn't page either, so the rows are then the whole diff.
  const totalFiles = result.totalFiles ?? result.diff.length;
  const added =
    result.filesAdded ?? result.diff.filter((d) => d.status === "added").length;
  const removed =
    result.filesRemoved ??
    result.diff.filter((d) => d.status === "removed").length;
  const modified =
    result.filesModified ??
    result.diff.filter((d) => d.status === "modified").length;

  if (json) {
    printJson(
      result.diff.map((d) => ({
        repoFilePath: d.filePath,
        status: d.status,
        baseRanges: d.baseRanges,
        headRanges: d.headRanges,
      })),
    );
  } else {
    const header = ["repoFilePath", "status", "baseRanges", "headRanges"];
    console.log(header.join("\t"));
    for (const d of result.diff) {
      const fields = [
        d.filePath,
        d.status,
        formatCoverageRanges(d.baseRanges),
        formatCoverageRanges(d.headRanges),
      ];
      console.log(fields.join("\t"));
    }
  }

  // Summary on stderr regardless of --json (which only changes stdout).
  logNotice(
    `${totalFiles} files with coverage changes ` +
      `(${added} added, ${removed} removed, ${modified} modified)`,
  );
  logResponseNotes(result);
};

export const jsCoverageDiffCommand: CommandModule<unknown, Options> = {
  command: "js-coverage-diff",
  describe:
    "Get the list of per-file JavaScript coverage diffs for a given test run against its own base run (defaults to the current git HEAD), or for a single replay diff (or a single screenshot of it). Outputs a TSV table with columns repoFilePath, status, baseRanges, headRanges. Pass --summary to print the aggregate difference instead of the list.",
  builder: {
    apiToken: { string: true, description: "Meticulous API token." },
    replayDiffId: {
      string: true,
      description:
        "The replay diff ID, to diff one replay pair. Cannot be combined with the whole-test-run options.",
    },
    screenshotName: {
      string: true,
      description:
        "Restrict coverage to this screenshot, which is only the coverage recorded since the preceding screenshot (for use with --replayDiffId; omit for the whole-replay diff).",
    },
    testRunId: {
      string: true,
      description:
        "The test run whose coverage to compare against its own base run's. Defaults to the run for the current git HEAD when neither this nor --commitSha is given. Not for a base run, which has no base of its own.",
    },
    commitSha: {
      string: true,
      description:
        "A commit SHA, used as an alternative to --testRunId: looks up the latest test run for the commit. Defaults to the current git HEAD when omitted.",
    },
    project: {
      string: true,
      description:
        "The project to look up the commit for (id, 'org/proj', or simply 'proj'). One-off override; when omitted, uses the token's project or the OAuth user's configured default project.",
      conflicts: ["testRunId"],
    },
    globFilter: {
      string: true,
      array: true,
      description:
        "Output only files whose repo path matches this gitignore-style glob (e.g. src/components/**). Repeatable: pass it more than once to match any of several globs.",
    },
    summary: {
      boolean: true,
      default: false,
      description:
        "Get the aggregate difference instead of the per-file list: the number of files added/removed/modified, each side's executed line count, and how many lines head newly covers (uniqueLinesAdded) or no longer covers (regressedLines). Whole-test-run diffs only.",
    },
    limit: {
      number: true,
      description:
        "Maximum files to output, ordered by repo path (1-1000, default 100).",
      coerce: coerceLimit(1000),
    },
    offset: {
      number: true,
      description: "Files to skip before --limit, for pagination.",
      coerce: coerceOffset,
    },
    dontWaitForTestRunToComplete: {
      boolean: true,
      default: false,
      description:
        "For a whole-test-run diff, return immediately instead of the default of blocking until the run finishes; an unfinished run is then reported as not complete.",
    },
  },
  handler: wrapHandler(handler),
};
