import { createClient } from "@alwaysmeticulous/client";
import type { MeticulousClient } from "@alwaysmeticulous/client";
import { CliUserError } from "../../../utils/cli-user-error";
import { readTryContext, type TryContextJson } from "./try-context";
import { CLI_COMMAND } from "./cli-command";

/**
 * A client scoped to the try project. The workspace's own try-context.json
 * comes before METICULOUS_API_TOKEN: inside the agent they are the same token,
 * but a user re-running a helper by hand may have another project's token
 * exported. Never the OAuth login, whose project is the account-wide default.
 */
export const createTryClient = (options: {
  apiToken: string | undefined;
  repoRoot: string;
}): { client: MeticulousClient; context: TryContextJson | null } => {
  const context = readTryContext(options.repoRoot);
  const apiToken =
    options.apiToken ??
    context?.apiToken ??
    process.env["METICULOUS_API_TOKEN"];
  if (!apiToken) {
    throw new CliUserError(
      `No Meticulous project token found. Run \`${CLI_COMMAND} try\` first (it writes .meticulous-try/try-context.json), ` +
        "or pass --apiToken.",
    );
  }
  return { client: createClient({ apiToken }), context };
};
