import { existsSync } from "fs";
import type { CommandModule } from "yargs";
import { wrapHandler } from "../../../command-utils/sentry.utils";
import {
  HELPER_OPTIONS,
  syncHandler,
  printResult,
  repoRootFrom,
  writeWorkspaceJson,
} from "../shared/helper-options";
import { readTryContext } from "../shared/try-context";
import { TRY_PATHS, TRY_WORKDIR, absoluteTryPath } from "../shared/try-paths";
import {
  findCandidatePrs,
  type CandidatePrsResult,
} from "./find-candidate-prs";

interface Options {
  cwd: string | undefined;
  json: boolean;
  limit: number;
  since: string;
  appPath: string | undefined;
  ref: string | undefined;
  maxCommits: number;
}

const handler = (options: Options): void => {
  const repoRoot = repoRootFrom(options.cwd);
  const appPath =
    options.appPath ?? readTryContext(repoRoot)?.selectedApp?.path ?? ".";
  const result = findCandidatePrs({
    repoRoot,
    ref: options.ref,
    since: options.since,
    appPath,
    limit: options.limit,
    maxCommits: options.maxCommits,
  });

  if (existsSync(absoluteTryPath(repoRoot, TRY_WORKDIR))) {
    writeWorkspaceJson(repoRoot, TRY_PATHS.candidates, result);
  }
  printResult(options.json, result, () => formatCandidates(result));
};

const formatCandidates = (result: CandidatePrsResult): string[] => {
  const header = `Scanned ${result.commitsScanned} commits on ${result.ref} since ${result.since}: ${result.mergedPrsFound} merged PRs, ${result.candidates.length} candidates (app: ${result.appPath})`;
  return [
    header,
    ...result.candidates.flatMap((candidate) => [
      `#${candidate.prNumber}  score=${candidate.score}  base=${candidate.baseSha.slice(0, 10)} head=${candidate.headSha.slice(0, 10)}  ${candidate.title}`,
      ...candidate.reasons.map((reason) => `    - ${reason}`),
    ]),
  ];
};

export const candidatePrsCommand: CommandModule<unknown, Options> = {
  command: "candidate-prs",
  describe:
    "Rank recently merged PRs (from local git history only) by how well a Meticulous backtest of them would demonstrate value",
  builder: {
    ...HELPER_OPTIONS,
    limit: {
      number: true,
      default: 10,
      description: "Maximum number of candidates to output",
    },
    since: {
      string: true,
      default: "90d",
      description: "How far back to look: 90d, 12w, 6m, or any git date",
    },
    appPath: {
      string: true,
      description:
        "Repo-relative path of the frontend app (defaults to the app in try-context.json, else the repo root)",
    },
    ref: {
      string: true,
      description:
        "Branch to scan (defaults to origin's default branch, else main/master)",
    },
    maxCommits: {
      number: true,
      default: 2000,
      description: "Maximum number of first-parent commits to scan",
    },
  },
  handler: wrapHandler(syncHandler(handler)),
};
