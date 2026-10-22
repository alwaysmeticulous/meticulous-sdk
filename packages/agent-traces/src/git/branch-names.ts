/**
 * Long-lived branches many PRs share. Matching a trace to a PR on one of
 * these would link every trace in the repository.
 */
export const DEFAULT_BRANCH_NAMES: ReadonlySet<string> = new Set([
  "main",
  "master",
  "develop",
  "development",
  "dev",
  "trunk",
  "staging",
  "production",
  "prod",
  "release",
  "head",
]);

export const isDefaultBranchName = (name: string): boolean =>
  DEFAULT_BRANCH_NAMES.has(name.toLowerCase());

const REF_PREFIX_REGEX = /^(?:refs\/heads\/|refs\/remotes\/[^/]+\/|origin\/)/;

/** Characters `git check-ref-format` rejects, plus whitespace. */
const INVALID_BRANCH_REGEX = /[\s~^:?*[\\]|\.\.|@\{|^[-/.]|[/.]$|\.lock$/;

const MAX_BRANCH_NAME_LENGTH = 255;

/**
 * Reduces a ref as written in a command or its output to the branch name, or
 * null when it is not a usable, non-default branch name.
 */
export const normaliseBranchName = (ref: string): string | null => {
  const name = ref.trim().replace(/^\+/, "").replace(REF_PREFIX_REGEX, "");
  if (
    name.length === 0 ||
    name.length > MAX_BRANCH_NAME_LENGTH ||
    INVALID_BRANCH_REGEX.test(name) ||
    isDefaultBranchName(name)
  ) {
    return null;
  }
  return name;
};
