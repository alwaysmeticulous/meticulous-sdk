import {
  clearOAuthTokens,
  getStoredOAuthTokens,
  readFileBasedToken,
  revokeOAuthRefreshToken,
} from "@alwaysmeticulous/client";
import { initLogger, logNotice } from "@alwaysmeticulous/common";
import type { Logger } from "loglevel";
import type { CommandModule } from "yargs";
import { wrapHandler } from "../../command-utils/sentry.utils";

export const logoutCommand: CommandModule = {
  command: "logout",
  describe: "Revoke and clear stored OAuth tokens",
  handler: wrapHandler(async () => {
    const logger = initLogger();
    try {
      await revokeStoredSession(logger);
    } finally {
      clearOAuthTokens();
    }
    // The default project is a server-side, per-user setting (not local
    // machine state), so logging out here deliberately leaves it — it's
    // still there the next time this account logs back in, anywhere.
    logNotice("Logged out successfully.");

    warnAboutRemainingCredentials(logger);
  }),
};

// The refresh token is an offline token: deleting the local copy alone leaves
// the session usable from any other copy until it expires, so revoke it first.
// Nothing here may fail the command — a logout that exits non-zero after the
// local tokens are already gone is worse than one that warns.
const revokeStoredSession = async (logger: Logger): Promise<void> => {
  let failureReason: string | null = null;
  try {
    const refreshToken = getStoredOAuthTokens()?.refreshToken;
    if (!refreshToken) {
      return;
    }
    const result = await revokeOAuthRefreshToken(refreshToken);
    failureReason = result.status === "failed" ? result.reason : null;
  } catch (error) {
    failureReason = error instanceof Error ? error.message : String(error);
  }
  if (failureReason != null) {
    logger.warn(
      `Could not revoke the session at the identity provider (${failureReason}). ` +
        "Local tokens are cleared regardless, but the session stays valid " +
        "until it expires.",
    );
  }
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
