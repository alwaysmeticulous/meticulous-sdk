import { clearOAuthTokens, readFileBasedToken } from "@alwaysmeticulous/client";
import { initLogger, logNotice } from "@alwaysmeticulous/common";
import type { Logger } from "loglevel";
import type { CommandModule } from "yargs";
import { wrapHandler } from "../../command-utils/sentry.utils";

export const logoutCommand: CommandModule = {
  command: "logout",
  describe: "Clear stored OAuth tokens",
  handler: wrapHandler(() => {
    const logger = initLogger();
    clearOAuthTokens();
    // The default project is a server-side, per-user setting (not local
    // machine state), so logging out here deliberately leaves it — it's
    // still there the next time this account logs back in, anywhere.
    logNotice("Logged out successfully.");

    warnAboutRemainingCredentials(logger);
    return Promise.resolve();
  }),
};

const warnAboutRemainingCredentials = (logger: Logger): void => {
  if (process.env["METICULOUS_API_TOKEN"]) {
    logger.warn(
      "Note: METICULOUS_API_TOKEN is still set in your environment and will " +
        "continue to be used. Unset it in your shell to fully log out.",
    );
  }

  // Best-effort: a malformed ~/.meticulous/config.json must not fail logout —
  // the credentials have already been cleared by this point.
  let fileToken: ReturnType<typeof readFileBasedToken> = null;
  try {
    fileToken = readFileBasedToken();
  } catch {
    return;
  }
  if (fileToken) {
    logger.warn(
      `Note: an apiToken is still present in ${fileToken.path} and ` +
        "will continue to be used. Remove it from that file to fully log out.",
    );
  }
};
