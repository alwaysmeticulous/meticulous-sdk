import { createClient } from "@alwaysmeticulous/client";
import type { MeticulousClient } from "@alwaysmeticulous/client";
import { CliUserError } from "../../../utils/cli-user-error";
import { readTryContext, type TryContextJson } from "./try-context";

/**
 * A client scoped to the try project. The agent gets the token as
 * METICULOUS_API_TOKEN; outside the agent (a user re-running a helper by hand)
 * it falls back to try-context.json, so helpers never act on whichever other
 * project the user's own login defaults to.
 */
export const createTryClient = (options: {
  apiToken: string | undefined;
  repoRoot: string;
}): { client: MeticulousClient; context: TryContextJson | null } => {
  const context = readTryContext(options.repoRoot);
  const apiToken =
    options.apiToken ??
    process.env["METICULOUS_API_TOKEN"] ??
    context?.apiToken;
  if (!apiToken) {
    throw new CliUserError(
      "No Meticulous project token found. Run `meticulous try` first (it writes .meticulous-try/try-context.json), " +
        "or pass --apiToken.",
    );
  }
  return { client: createClient({ apiToken }), context };
};
