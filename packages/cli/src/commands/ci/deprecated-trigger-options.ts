import { initLogger } from "@alwaysmeticulous/common";

/**
 * The custom test-run-trigger options that were added to `ci upload-assets` /
 * `ci upload-container`. They drive custom (manually triggered) test runs,
 * which now live in the dedicated `agent` commands (`agent upload-build` +
 * `agent trigger-test-run`). They keep working here but are deprecated and will
 * be removed in a future version.
 */
export const DEPRECATED_TRIGGER_OPTION_DESCRIPTION =
  "[DEPRECATED] For custom test-run triggers, use 'meticulous agent upload-build' + 'meticulous agent trigger-test-run' instead.";

/**
 * Logs a deprecation warning when any of the moved custom-trigger options is
 * passed to a `ci` upload command.
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

  const logger = initLogger();
  logger.warn(
    `${used.join(", ")} ${used.length === 1 ? "is" : "are"} deprecated on this command. ` +
      "These options are for custom (manually triggered) test runs, which have moved to the dedicated agent commands: " +
      "use 'meticulous agent upload-build' to upload your build, then 'meticulous agent trigger-test-run' to trigger the run. " +
      "They will be removed from the 'ci' upload commands in a future version.",
  );
};
