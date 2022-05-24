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

const getAppUrl: (options: { sessionData: any; appUrl: string }) => string = ({
  sessionData,
  appUrl,
}) => {
  if (!appUrl) {
    const { startUrl, startURL } = sessionData.userEvents.window;
    return startUrl || startURL;
  }
  try {
    const url = new URL(appUrl);
    return url.toString();
  } catch (error) {
    if (error instanceof TypeError) {
      const urlHttps = new URL(`https://${appUrl}`);
      return urlHttps.toString();
    }
    throw error;
  }
};

export const getStartUrl: (options: {
  sessionData: any;
  appUrl: string;
}) => string = ({ sessionData, appUrl }) => {
  const { startUrl, startURL } = sessionData.userEvents.window;

  // Default to the base URL if we did not record startURL (legacy sessions)
  const appUrlObj = new URL(getAppUrl({ sessionData, appUrl }));
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
