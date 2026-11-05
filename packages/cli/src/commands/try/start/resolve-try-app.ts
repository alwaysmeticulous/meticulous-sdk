import { isInteractiveContext } from "@alwaysmeticulous/client";
import {
  discoverFrontendApps,
  type DiscoveredApp,
} from "../../onboard/discover-apps";
import { resolveSelectedApp } from "../../onboard/resolve-app";

export interface TryAppSelection {
  selectedApp: DiscoveredApp | null;
  discoveredApps: DiscoveredApp[];
  isMonorepo: boolean;
}

/**
 * Like onboard's app picker, except that a non-interactive monorepo run does
 * not fail: the agent picks the app itself from `discoveredApps`.
 */
export const resolveTryApp = async (options: {
  projectRoot: string;
  app: string | undefined;
}): Promise<TryAppSelection> => {
  const discoveredApps = discoverFrontendApps(options.projectRoot);
  const isMonorepo = discoveredApps.length > 1;
  const canResolve =
    options.app != null || !isMonorepo || isInteractiveContext();
  const selectedApp = canResolve
    ? await resolveSelectedApp({
        projectRoot: options.projectRoot,
        app: options.app,
      })
    : null;
  return { selectedApp, discoveredApps, isMonorepo };
};
