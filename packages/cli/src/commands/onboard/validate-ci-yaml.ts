import { lstatSync, readFileSync, readdirSync } from "fs";
import { join, relative } from "path";
import chalk from "chalk";
import { parseDocument } from "yaml";

export interface InvalidCiYamlFile {
  /** Path relative to the repository root, for display. */
  relativePath: string;
  /** First parse error, already including a line/column when the parser knew one. */
  problem: string;
}

const WORKFLOWS_DIR = join(".github", "workflows");

const SINGLE_FILE_CANDIDATES = [
  ".gitlab-ci.yml",
  ".gitlab-ci.yaml",
  "bitbucket-pipelines.yml",
  "bitbucket-pipelines.yaml",
];

/**
 * Parses the CI files that mention Meticulous and reports the ones a CI
 * provider would reject. The install agent writes this YAML by hand, and a
 * syntax slip there only shows up as a failed pipeline after the PR is open.
 */
export const findInvalidCiYaml = (options: {
  projectRoot: string;
}): InvalidCiYamlFile[] => {
  const invalid: InvalidCiYamlFile[] = [];
  for (const absolutePath of candidateCiFiles(options.projectRoot)) {
    const contents = readMeticulousCiFile(absolutePath);
    if (contents === null) {
      continue;
    }
    const problem = firstParseError(contents);
    if (problem !== null) {
      invalid.push({
        relativePath: relative(options.projectRoot, absolutePath),
        problem,
      });
    }
  }
  return invalid;
};

/**
 * Prints a warning for CI files the agent left unparseable, so the user hears
 * it here rather than from a red pipeline on the onboarding PR.
 */
export const warnAboutInvalidCiYaml = (options: {
  projectRoot: string;
}): void => {
  const invalid = findInvalidCiYaml(options);
  if (invalid.length === 0) {
    return;
  }

  console.log("");
  console.log(
    chalk.yellow(
      invalid.length === 1
        ? "A CI file mentioning Meticulous is not valid YAML:"
        : "Some CI files mentioning Meticulous are not valid YAML:",
    ),
  );
  for (const file of invalid) {
    console.log(`  ${chalk.bold(file.relativePath)}: ${file.problem}`);
  }
  console.log(
    chalk.dim(
      "  Fix these before merging — the pipeline will not run otherwise.",
    ),
  );
};

const candidateCiFiles = (projectRoot: string): string[] => {
  const files = SINGLE_FILE_CANDIDATES.map((name) => join(projectRoot, name));
  const workflowsDir = join(projectRoot, WORKFLOWS_DIR);
  let entries: string[];
  try {
    entries = readdirSync(workflowsDir);
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (entry.endsWith(".yml") || entry.endsWith(".yaml")) {
      files.push(join(workflowsDir, entry));
    }
  }
  return files;
};

/**
 * Reads a candidate file, or returns null when it is missing, is not a regular
 * file (we never follow links out of the repo), or has nothing to do with us.
 */
const readMeticulousCiFile = (absolutePath: string): string | null => {
  try {
    if (!lstatSync(absolutePath).isFile()) {
      return null;
    }
    const contents = readFileSync(absolutePath, "utf8");
    return contents.toLowerCase().includes("meticulous") ? contents : null;
  } catch {
    return null;
  }
};

const firstParseError = (contents: string): string | null => {
  let errors: ReturnType<typeof parseDocument>["errors"];
  try {
    errors = parseDocument(contents).errors;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  const [first] = errors;
  if (!first) {
    return null;
  }
  // The parser's message already names the line and column, then quotes the
  // offending source below it. Keep the sentence, drop the excerpt.
  const [summary = first.message] = first.message.split("\n");
  return summary.replace(/:$/, "");
};
