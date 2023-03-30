import { fetchAsset } from "@alwaysmeticulous/downloader-helpers";
import { ReplayEventsDependencies } from "@alwaysmeticulous/replayer";

export const loadReplayEventsDependencies =
  async (): Promise<ReplayEventsDependencies> => {
    const browserUserInteractions = await fetchAsset(
      "replay/v2/snippet-user-interactions.bundle.js"
    );
    const browserPlayback = await fetchAsset(
      "replay/v2/snippet-playback.bundle.js"
    );
    const browserUrlObserver = await fetchAsset(
      "replay/v2/snippet-url-observer.bundle.js"
    );
    const nodeBrowserContext = await fetchAsset(
      "replay/v2/node-browser-context.bundle.js"
    );
    const nodeNetworkStubbing = await fetchAsset(
      "replay/v2/node-network-stubbing.bundle.js"
    );
    const nodeUserInteractions = await fetchAsset(
      "replay/v2/node-user-interactions.bundle.js"
    );

    return {
      browserUserInteractions: {
        key: "browserUserInteractions",
        location: browserUserInteractions,
      },
      browserPlayback: {
        key: "browserPlayback",
        location: browserPlayback,
      },
      browserUrlObserver: {
        key: "browserUrlObserver",
        location: browserUrlObserver,
      },
      nodeBrowserContext: {
        key: "nodeBrowserContext",
        location: nodeBrowserContext,
      },
      nodeNetworkStubbing: {
        key: "nodeNetworkStubbing",
        location: nodeNetworkStubbing,
      },
      nodeUserInteractions: {
        key: "nodeUserInteractions",
        location: nodeUserInteractions,
      },
    };
  };
