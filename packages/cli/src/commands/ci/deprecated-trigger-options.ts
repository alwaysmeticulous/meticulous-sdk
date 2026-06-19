/**
 * The custom test-run-trigger options that were added to `ci upload-assets` /
 * `ci upload-container` and have since moved to the streamlined
 * `meticulous agent trigger-test-run` command. They keep working here but are
 * deprecated and will be removed in a future version.
 */
export const DEPRECATED_TRIGGER_OPTION_DESCRIPTION =
  "[DEPRECATED] Use 'meticulous agent trigger-test-run' instead.";

/**
 * Emits a one-line stderr deprecation warning when any of the moved
 * custom-trigger options is passed to a `ci` upload command.
 */
export const warnIfDeprecatedTriggerOptionsUsed = (options: {
  baseSha?: string | undefined;
  gitDiffOutput?: string | undefined;
  repoDirectory?: string | undefined;
  waitForTestRunToComplete?: boolean | undefined;
}): void => {
  const used = [
    options.baseSha != null && "--baseSha",
    options.gitDiffOutput != null && "--gitDiffOutput",
    options.repoDirectory != null && "--repoDirectory",
    options.waitForTestRunToComplete && "--waitForTestRunToComplete",
  ].filter((flag): flag is string => Boolean(flag));

  if (used.length === 0) {
    return;
  }

  process.stderr.write(
    `\nDEPRECATION WARNING: ${used.join(", ")} ${used.length === 1 ? "is" : "are"} deprecated on this command. ` +
      "Use 'meticulous agent trigger-test-run' instead. " +
      "These options will be removed from the 'ci' upload commands in a future version.\n\n",
  );
};
