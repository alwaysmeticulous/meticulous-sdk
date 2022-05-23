export interface ReplayEventsDependency<Key extends string> {
  key: Key;
  location: string;
}

interface BaseReplayEventsDependencies {
  [key: ReplayEventsDependency<string>["key"]]: ReplayEventsDependency<string>;
}

export interface ReplayEventsDependencies extends BaseReplayEventsDependencies {
  replayDebugger: ReplayEventsDependency<"replayDebugger">;
}

export const getStartUrl = ({
  sessionData,
  appUrl,
}: {
  sessionData: any;
  appUrl: string;
}) => {
  const { startUrl, startURL } = sessionData.userEvents.window;

  // Default to the base URL if we did not record startURL (legacy sessions)
  const appUrlObj = new URL(appUrl);
  const startRouteUrl =
    appUrlObj.pathname === "/" && !appUrlObj.search && !appUrlObj.hash
      ? new URL(startUrl || startURL)
      : appUrlObj;
  startRouteUrl.host = appUrlObj.host;
  startRouteUrl.port = appUrlObj.port;
  startRouteUrl.protocol = appUrlObj.protocol;
  startRouteUrl.username = appUrlObj.username;
  startRouteUrl.password = appUrlObj.password;

  return startRouteUrl.toString();
};
