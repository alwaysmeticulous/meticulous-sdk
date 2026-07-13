// Builds made from a dirty git working tree record their commit as
// `<sha>-unclean` (see get-commit-package-last-modified-in.ts in the scripts
// package). The suffix is not a valid git ref, and the fact that a build was
// unclean is itself useful investigative context — the source at that commit
// may not exactly match what actually ran.
export const UNCLEAN_SHA_SUFFIX = "-unclean";

export interface ParsedMeticulousSha {
  // The bare commit SHA, suitable as a git ref (suffix stripped). Undefined if
  // no SHA was available.
  sha: string | undefined;
  // True if the build was made from a dirty working tree.
  wasUnclean: boolean;
}

export const parseMeticulousSha = (
  meticulousSha: string | undefined,
): ParsedMeticulousSha => {
  if (!meticulousSha) {
    return { sha: undefined, wasUnclean: false };
  }
  if (meticulousSha.endsWith(UNCLEAN_SHA_SUFFIX)) {
    return {
      sha: meticulousSha.slice(0, -UNCLEAN_SHA_SUFFIX.length),
      wasUnclean: true,
    };
  }
  return { sha: meticulousSha, wasUnclean: false };
};
