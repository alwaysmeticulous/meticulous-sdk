#!/usr/bin/env ts-node

/*
All third-party GitHub actions should use a precise SHA version rather than a tag, with the major version number appended in a comment: 'pnpm/action-setup@fc06bc1257f339d1d5d8b3a19a8cae5388b55320 # v4' instead of 'pnpm/action-setup@v4'. This is done to minimize supply chain risk.

This script bumps these to the latest release for the given major version tag in the comment appended to each line.
*/

const { spawnSync } = require("child_process");
const { readdirSync, readFileSync, writeFileSync } = require("fs");
const https = require("https");
const path = require("path");
const yargs = require("yargs");

type CliArgs = {
  workflowsDir: string;
  dryRun: boolean;
  daysSincePublishedAtLeast: number;
};

type WorkflowUpdate = {
  filePath: string;
  lineNumber: number;
  actionPath: string;
  oldSha: string;
  newSha: string;
  major: number;
};

type GitHubRelease = {
  tag_name?: string;
  published_at?: string | null;
  draft?: boolean;
  prerelease?: boolean;
};

const STRICT_HASH_USES_RE =
  /^(?<indent>\s*)uses:\s+(?<action>[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*)@(?<sha>[0-9a-f]{40})\s+#\s+v(?<major>[1-9][0-9]*)\s*$/;
const LOOSE_HASH_USES_RE = /^\s*uses:\s+\S+@[0-9a-f]{40}\b.*$/;

const run = async (): Promise<void> => {
  const args = parseArgs();
  const repoRoot = getRepoRoot();
  const workflowsDir = resolveWorkflowsDir({
    workflowsDir: args.workflowsDir,
    repoRoot,
  });
  const workflowFiles = getWorkflowFiles(workflowsDir);
  if (workflowFiles.length === 0) {
    throw new Error(`No workflow files found in ${workflowsDir}`);
  }

  const refCache = new Map<string, string>();
  const updates: WorkflowUpdate[] = [];

  for (const workflowFile of workflowFiles) {
    updates.push(
      ...(await processWorkflowFile({
        workflowFile,
        dryRun: args.dryRun,
        daysSincePublishedAtLeast: args.daysSincePublishedAtLeast,
        refCache,
      })),
    );
  }

  printSummary({ updates, dryRun: args.dryRun });
};

const parseArgs = (): CliArgs => {
  const parsed = yargs
    .option("workflowsDir", {
      type: "string",
      alias: "workflows-dir",
      default: ".github/workflows",
      description:
        "Path to workflow directory (relative paths are resolved from repository root)",
    })
    .option("dryRun", {
      type: "boolean",
      alias: "dry-run",
      default: false,
      description: "Report updates without writing files",
    })
    .option("daysSincePublishedAtLeast", {
      type: "number",
      alias: "days-since-published-at-least",
      default: 5,
      description:
        "Select newest release tag in this major published at least this many days ago",
    })
    .strict()
    .check((argv: Record<string, unknown>) => {
      if (
        typeof argv.daysSincePublishedAtLeast !== "number" ||
        !Number.isInteger(argv.daysSincePublishedAtLeast) ||
        argv.daysSincePublishedAtLeast < 0
      ) {
        throw new Error(
          "--daysSincePublishedAtLeast must be a non-negative integer",
        );
      }
      return true;
    })
    .help()
    .parseSync();

  return {
    workflowsDir: parsed.workflowsDir,
    dryRun: parsed.dryRun,
    daysSincePublishedAtLeast: parsed.daysSincePublishedAtLeast,
  };
};

const getRepoRoot = (): string => {
  const gitRootResult = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  });
  if (gitRootResult.status !== 0) {
    const output = (gitRootResult.stderr || gitRootResult.stdout || "").trim();
    throw new Error(`Failed to determine repository root: ${output}`);
  }

  return gitRootResult.stdout.trim();
};

const resolveWorkflowsDir = ({
  workflowsDir,
  repoRoot,
}: {
  workflowsDir: string;
  repoRoot: string;
}): string => {
  if (path.isAbsolute(workflowsDir)) {
    return workflowsDir;
  }
  return path.join(repoRoot, workflowsDir);
};

const getWorkflowFiles = (workflowsDir: string): string[] => {
  const files = readdirSync(workflowsDir, { withFileTypes: true })
    .filter(
      (entry: import("fs").Dirent) =>
        entry.isFile() &&
        (entry.name.endsWith(".yml") || entry.name.endsWith(".yaml")),
    )
    .map((entry: import("fs").Dirent) => path.join(workflowsDir, entry.name))
    .sort();

  return files;
};

const processWorkflowFile = async ({
  workflowFile,
  dryRun,
  daysSincePublishedAtLeast,
  refCache,
}: {
  workflowFile: string;
  dryRun: boolean;
  daysSincePublishedAtLeast: number;
  refCache: Map<string, string>;
}): Promise<WorkflowUpdate[]> => {
  const content = readFileSync(workflowFile, "utf8");
  const originalLines = content.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const updatedLines = [...originalLines];
  const updates: WorkflowUpdate[] = [];

  for (let lineIndex = 0; lineIndex < originalLines.length; lineIndex += 1) {
    const originalLine = originalLines[lineIndex];
    const lineWithoutLineEnding = originalLine.replace(/\r?\n$/, "");

    if (!lineWithoutLineEnding.includes("uses:")) {
      continue;
    }

    if (!LOOSE_HASH_USES_RE.test(lineWithoutLineEnding)) {
      continue;
    }

    const strictMatch = STRICT_HASH_USES_RE.exec(lineWithoutLineEnding);
    if (strictMatch === null || strictMatch.groups === undefined) {
      throw new Error(
        [
          "Unsupported hash-pinned `uses` format ",
          `in ${workflowFile}:${lineIndex + 1}: ${JSON.stringify(lineWithoutLineEnding)}.`,
          "Expected `uses: owner/repo[/path]@<40-char-sha> # vN`.",
        ].join(" "),
      );
    }

    const actionPath = strictMatch.groups.action;
    const oldSha = strictMatch.groups.sha;
    const major = Number.parseInt(strictMatch.groups.major, 10);
    const ownerRepo = getOwnerRepo(actionPath);
    const cacheKey = `${ownerRepo}@${major}@${daysSincePublishedAtLeast}`;

    let newSha = refCache.get(cacheKey);
    if (newSha === undefined) {
      newSha = await resolveMajorTagSha({
        ownerRepo,
        major,
        daysSincePublishedAtLeast,
      });
      refCache.set(cacheKey, newSha);
    }

    if (newSha === oldSha) {
      continue;
    }

    const indent = strictMatch.groups.indent;
    const lineEndingMatch = originalLine.match(/(\r?\n)$/);
    const lineEnding = lineEndingMatch?.[1] ?? "";
    updatedLines[lineIndex] =
      `${indent}uses: ${actionPath}@${newSha} # v${major}${lineEnding}`;

    updates.push({
      filePath: workflowFile,
      lineNumber: lineIndex + 1,
      actionPath,
      oldSha,
      newSha,
      major,
    });
  }

  if (updates.length > 0 && !dryRun) {
    writeFileSync(workflowFile, updatedLines.join(""), "utf8");
  }

  return updates;
};

const getOwnerRepo = (actionPath: string): string => {
  const parts = actionPath.split("/");
  if (parts.length < 2) {
    throw new Error(
      `Action path must include owner/repo, got: ${JSON.stringify(actionPath)}`,
    );
  }

  return `${parts[0]}/${parts[1]}`;
};

const resolveMajorTagSha = async ({
  ownerRepo,
  major,
  daysSincePublishedAtLeast,
}: {
  ownerRepo: string;
  major: number;
  daysSincePublishedAtLeast: number;
}): Promise<string> => {
  const tagName = `v${major}`;
  const release = await getMostRecentEligibleRelease({
    ownerRepo,
    major,
    daysSincePublishedAtLeast,
  });

  if (release !== null) {
    return resolveTagSha({ ownerRepo, tagName: release.tagName });
  }

  if (daysSincePublishedAtLeast === 0) {
    return resolveTagSha({ ownerRepo, tagName });
  }

  if (release === null) {
    throw new Error(
      `Could not find a non-prerelease ${ownerRepo} tag in major ${tagName} published at least ${daysSincePublishedAtLeast} day(s) ago`,
    );
  }
  throw new Error(`Could not resolve release tag for ${ownerRepo}@${tagName}`);
};

const getMostRecentEligibleRelease = async ({
  ownerRepo,
  major,
  daysSincePublishedAtLeast,
}: {
  ownerRepo: string;
  major: number;
  daysSincePublishedAtLeast: number;
}): Promise<{ tagName: string } | null> => {
  const cutoffTimestamp =
    Date.now() - daysSincePublishedAtLeast * 24 * 60 * 60 * 1000;
  let page = 1;

  while (true) {
    const releases = await fetchReleasesPage({ ownerRepo, page });
    if (releases.length === 0) {
      return null;
    }

    for (const release of releases) {
      if (release.draft === true || release.prerelease === true) {
        continue;
      }

      const tagName = release.tag_name;
      if (tagName === undefined || !matchesMajor(tagName, major)) {
        continue;
      }

      const publishedAt = release.published_at;
      if (publishedAt === undefined || publishedAt === null) {
        continue;
      }

      const publishedTimestamp = Date.parse(publishedAt);
      if (Number.isNaN(publishedTimestamp)) {
        throw new Error(
          `Invalid published_at date for ${ownerRepo} release ${JSON.stringify(tagName)}: ${JSON.stringify(publishedAt)}`,
        );
      }

      if (publishedTimestamp <= cutoffTimestamp) {
        return { tagName };
      }
    }

    page += 1;
  }
};

const fetchReleasesPage = async ({
  ownerRepo,
  page,
}: {
  ownerRepo: string;
  page: number;
}): Promise<GitHubRelease[]> => {
  const url = `https://api.github.com/repos/${ownerRepo}/releases?per_page=100&page=${page}`;
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "alwaysmeticulous-workflow-action-hash-bumper",
  };
  if (typeof token === "string" && token.length > 0) {
    headers.Authorization = `Bearer ${token}`;
  }

  const payload = await httpGetJson<unknown>({ url, headers });
  if (!Array.isArray(payload)) {
    throw new Error(
      `Unexpected GitHub releases response for ${ownerRepo} page ${page}: expected array`,
    );
  }

  return payload as GitHubRelease[];
};

const httpGetJson = async <T>({
  url,
  headers,
}: {
  url: string;
  headers: Record<string, string>;
}): Promise<T> =>
  new Promise((resolve, reject) => {
    const request = https.request(
      url,
      { method: "GET", headers },
      (response: import("http").IncomingMessage) => {
        let responseBody = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: Buffer) => {
          responseBody += chunk;
        });
        response.on("end", () => {
          const statusCode = response.statusCode;
          if (statusCode === undefined) {
            reject(new Error(`Request to ${url} did not return a status code`));
            return;
          }

          if (statusCode < 200 || statusCode >= 300) {
            reject(
              new Error(
                `GitHub API request failed (${statusCode}) for ${url}: ${responseBody.trim()}`,
              ),
            );
            return;
          }

          try {
            resolve(JSON.parse(responseBody) as T);
          } catch (error) {
            reject(
              new Error(
                `Failed parsing JSON response from ${url}: ${error instanceof Error ? error.message : String(error)}`,
              ),
            );
          }
        });
      },
    );

    request.on("error", (error: Error) => {
      reject(error);
    });
    request.end();
  });

const matchesMajor = (tagName: string, major: number): boolean => {
  const majorTag = `v${major}`;
  return tagName === majorTag || tagName.startsWith(`${majorTag}.`);
};

const resolveTagSha = ({
  ownerRepo,
  tagName,
}: {
  ownerRepo: string;
  tagName: string;
}): string => {
  // Omit --refs so that git ls-remote also returns peeled ("^{}") entries.
  // For annotated tags, git ls-remote outputs two lines:
  //   <tag-object-sha>  refs/tags/<tag>
  //   <commit-sha>      refs/tags/<tag>^{}
  // We must pin to the commit SHA, not the tag-object SHA, because the tag
  // object is mutable (the tag can be force-pushed) and GitHub Actions
  // resolves annotated-tag SHAs to the underlying commit anyway.
  // For lightweight tags there is only one line (already a commit SHA).
  const lsRemoteResult = spawnSync(
    "git",
    [
      "ls-remote",
      "--tags",
      `https://github.com/${ownerRepo}.git`,
      `refs/tags/${tagName}`,
      `refs/tags/${tagName}^{}`,
    ],
    { encoding: "utf8" },
  );

  if (lsRemoteResult.status !== 0) {
    const output = (
      lsRemoteResult.stderr ||
      lsRemoteResult.stdout ||
      ""
    ).trim();
    throw new Error(`Failed resolving ${ownerRepo}@${tagName}: ${output}`);
  }

  const outputLines = lsRemoteResult.stdout
    .split("\n")
    .map((line: string) => line.trim())
    .filter((line: string) => line.length > 0);

  if (outputLines.length === 0 || outputLines.length > 2) {
    throw new Error(
      `Expected 1 or 2 refs for ${ownerRepo}@${tagName}, got ${outputLines.length}`,
    );
  }

  const parseLine = (line: string): { sha: string; ref: string } => {
    const tabIndex = line.indexOf("\t");
    if (tabIndex === -1) {
      throw new Error(
        `Unexpected ls-remote output for ${ownerRepo}@${tagName}: ${JSON.stringify(line)}`,
      );
    }
    return { sha: line.slice(0, tabIndex), ref: line.slice(tabIndex + 1) };
  };

  // Prefer the peeled entry (refs/tags/<tag>^{}) — that is always a commit SHA.
  const peeledRef = `refs/tags/${tagName}^{}`;
  const directRef = `refs/tags/${tagName}`;

  const peeledLine = outputLines.find((l: string) => parseLine(l).ref === peeledRef);
  const directLine = outputLines.find((l: string) => parseLine(l).ref === directRef);

  const { sha, ref } = peeledLine
    ? parseLine(peeledLine)
    : directLine
      ? parseLine(directLine)
      : (() => {
          throw new Error(
            `Could not find expected ref for ${ownerRepo}@${tagName} in ls-remote output`,
          );
        })();

  if (ref !== peeledRef && ref !== directRef) {
    throw new Error(
      `Unexpected ref for ${ownerRepo}@${tagName}: ${JSON.stringify(ref)}`,
    );
  }

  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error(
      `Resolved ref for ${ownerRepo}@${tagName} is not a commit sha: ${JSON.stringify(sha)}`,
    );
  }

  return sha;
};

const printSummary = ({
  updates,
  dryRun,
}: {
  updates: WorkflowUpdate[];
  dryRun: boolean;
}): void => {
  const mode = dryRun ? "Dry run" : "Updated";
  console.log(`${mode}: ${updates.length} hash-pinned action reference(s).`);

  for (const update of updates) {
    console.log(
      [
        `- ${update.filePath}:${update.lineNumber} ${update.actionPath} # v${update.major}`,
        `  ${update.oldSha} -> ${update.newSha}`,
      ].join("\n"),
    );
  }
};

void run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exit(1);
});
