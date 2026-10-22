import {
  compileRegex,
  getTracesUserConfigPath,
  loadTracesUserConfig,
} from "@alwaysmeticulous/agent-traces";
import { CliUserError } from "../../../utils/cli-user-error";

/**
 * The `--excludeToolOutputRegex` flags plus the user's own setting. Like the
 * agent traces uploader, an invalid regex or config file stops the upload
 * rather than sending tool outputs the user meant to exclude.
 */
export const resolveExcludeToolOutputRegexes = (flags: string[]): RegExp[] => {
  const { config, problems } = loadTracesUserConfig();
  if (problems.length > 0) {
    throw new CliUserError(
      `Invalid ${getTracesUserConfigPath()}: ${problems.join("; ")}`,
    );
  }
  const fromFlags = flags.map((flag) => {
    const regex = flag.trim() ? compileRegex(flag) : undefined;
    if (!regex) {
      throw new CliUserError(
        `--excludeToolOutputRegex must be a valid regular expression, got "${flag}"`,
      );
    }
    return regex;
  });
  return [
    ...fromFlags,
    ...(config.excludeToolOutputRegex ? [config.excludeToolOutputRegex] : []),
  ];
};
