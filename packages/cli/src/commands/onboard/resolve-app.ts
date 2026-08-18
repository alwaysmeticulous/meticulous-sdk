import { isInteractiveContext } from "@alwaysmeticulous/client";
import chalk from "chalk";
import inquirer from "inquirer";
import { CliUserError } from "../../utils/cli-user-error";
import {
  unsupportedSsrWarningMessage,
  unsupportedSsrMessage,
  type FrameworkDetection,
} from "./detect-framework";
import {
  discoverFrontendApps,
  promptForMonorepoApp,
  type DiscoveredApp,
} from "./discover-apps";

/**
 * Picks the frontend app to onboard: the `--app` match, the only discovered
 * app, or an interactive picker when the repo is a monorepo.
 */
export const resolveSelectedApp = async (options: {
  projectRoot: string;
  app: string | undefined;
}): Promise<DiscoveredApp> => {
  const apps = discoverFrontendApps(options.projectRoot);

  if (options.app) {
    const requested = options.app.trim();
    const match = apps.find(
      (app) =>
        app.path === requested ||
        app.name === requested ||
        app.packageName === requested,
    );
    if (!match) {
      throw new CliUserError(
        `App '${requested}' not found. Available frontend apps:\n${formatAppList(apps)}`,
      );
    }
    return match;
  }

  if (apps.length <= 1) {
    return apps[0] ?? { path: ".", name: "app", packageName: null };
  }

  if (!isInteractiveContext()) {
    throw new CliUserError(
      "Multiple frontend apps detected in this monorepo, but no interactive terminal is available.\n" +
        "Pass `--app <path-or-name>` to choose one:\n" +
        formatAppList(apps),
    );
  }

  return promptForMonorepoApp(apps);
};

/**
 * Warns about unsupported SSR before anything is written and lets the user
 * decide whether to continue. Non-interactive runs require the explicit
 * `--skip-ssr-check` override because there is nobody to confirm.
 */
export const assertSupportedSsr = async (options: {
  detection: FrameworkDetection;
  selectedApp: DiscoveredApp;
  skipSsrCheck: boolean;
}): Promise<void> => {
  const { detection, selectedApp, skipSsrCheck } = options;
  if (!detection.isUnsupportedSsr || skipSsrCheck) {
    return;
  }

  const appLabel = `${selectedApp.name} (${selectedApp.path})`;

  console.log(chalk.yellow(unsupportedSsrWarningMessage(detection)));
  console.log(chalk.dim(`  Selected app: ${appLabel}`));
  console.log("");

  if (!isInteractiveContext()) {
    throw new CliUserError(
      `${unsupportedSsrMessage(detection)}\n\nSelected app: ${appLabel}\n\n` +
        "There is no interactive terminal to confirm that you want to continue. " +
        "Re-run with `--skip-ssr-check` to accept this risk.",
    );
  }

  const { proceed } = await inquirer.prompt<{ proceed: boolean }>([
    {
      type: "confirm",
      name: "proceed",
      message:
        detection.framework === "nextjs-app"
          ? `We think ${appLabel} uses Next.js App Router. Continue anyway?`
          : `We think ${appLabel} is an unsupported SSR setup. Continue anyway?`,
      default: false,
    },
  ]);

  if (!proceed) {
    throw new CliUserError(
      `${unsupportedSsrMessage(detection)}\n\nSelected app: ${appLabel}`,
    );
  }
};

const formatAppList = (apps: DiscoveredApp[]): string =>
  apps.map((app) => `  - ${app.name} (${app.path})`).join("\n");
