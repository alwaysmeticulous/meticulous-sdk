/**
 * Asterixes out a string, preserving whitespace if `preserveWhitespace` is true. This ensures
 * the same word wrapping and UI layout cases are tested by the redacted version as with the original
 * version.
 */
export const asterixOut = (
  str: string,
  opts: { preserveWhitespace?: boolean } = { preserveWhitespace: true }
) => {
  return opts.preserveWhitespace
    ? str.replace(/[^ ]/g, "*")
    : str.replace(/./g, "*");
};
