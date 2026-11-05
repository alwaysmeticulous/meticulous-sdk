import type { CommandModule } from "yargs";
import { wrapHandler } from "../../../command-utils/sentry.utils";
import { CliUserError } from "../../../utils/cli-user-error";
import {
  HELPER_OPTIONS,
  printResult,
  repoRootFrom,
} from "../shared/helper-options";
import { writePrivateWorkspaceJson } from "../shared/try-context";
import { TRY_PATHS } from "../shared/try-paths";
import type { LoginCaptureEnd, StorageState } from "./capture-login-state";
import { captureLoginState } from "./capture-login-state";

interface LoginOptions {
  cwd: string | undefined;
  json: boolean;
  url: string;
  timeoutSeconds: number;
}

interface LoginSummary {
  path: string;
  endedBy: LoginCaptureEnd;
  cookieCount: number;
  cookieDomains: string[];
  localStorage: { origin: string; keys: string[] }[];
}

const loginHandler = async (options: LoginOptions): Promise<void> => {
  const repoRoot = repoRootFrom(options.cwd);
  assertHttpUrl(options.url);
  console.error(
    `A browser window has opened at ${options.url}. Log in to the app, wait until it shows you are signed in, then close the window.`,
  );
  const { state, endedBy } = await captureLoginState({
    url: options.url,
    timeoutMs: options.timeoutSeconds * 1000,
  });
  if (state.cookies.length === 0 && state.origins.length === 0) {
    throw new CliUserError(
      endedBy === "timeout"
        ? `Timed out after ${options.timeoutSeconds}s with no cookies or local storage captured.`
        : "The window was closed with no cookies or local storage captured: the app keeps its login elsewhere (e.g. session storage or IndexedDB), or the login didn't complete.",
    );
  }
  const path = writePrivateWorkspaceJson(repoRoot, TRY_PATHS.authState, state);
  const summary = summarize(path, endedBy, state);
  printResult(options.json, summary, () => [
    `Saved login state to ${path} (${endedBy === "closed" ? "window closed" : "timed out"})`,
    `  ${summary.cookieCount} cookie(s) for: ${summary.cookieDomains.join(", ") || "none"}`,
    ...summary.localStorage.map(
      ({ origin, keys }) => `  local storage for ${origin}: ${keys.join(", ")}`,
    ),
  ]);
};

const assertHttpUrl = (url: string): void => {
  let protocol: string;
  try {
    protocol = new URL(url).protocol;
  } catch {
    throw new CliUserError(`--url '${url}' is not a valid URL.`);
  }
  if (protocol !== "http:" && protocol !== "https:") {
    throw new CliUserError(`--url must be an http(s) URL, got '${url}'.`);
  }
};

/** Names only: the values are the user's live session. */
const summarize = (
  path: string,
  endedBy: LoginCaptureEnd,
  state: StorageState,
): LoginSummary => ({
  path,
  endedBy,
  cookieCount: state.cookies.length,
  cookieDomains: [...new Set(state.cookies.map((cookie) => cookie.domain))],
  localStorage: state.origins.map(({ origin, localStorage }) => ({
    origin,
    keys: localStorage.map(({ name }) => name),
  })),
});

export const loginCommand: CommandModule<unknown, LoginOptions> = {
  command: "login",
  describe:
    "Open a browser for the user to log in to the app, then save its cookies and local storage to .meticulous-try/auth/storage-state.json (for --storageState) when they close the window",
  builder: {
    ...HELPER_OPTIONS,
    url: {
      string: true,
      demandOption: true,
      description:
        "URL to open, usually the locally served app's login page or a page that redirects to it",
    },
    timeoutSeconds: {
      number: true,
      default: 900,
      description:
        "Stop waiting for the window to close after this long, saving whatever login state the browser holds",
    },
  },
  handler: wrapHandler(loginHandler),
};
