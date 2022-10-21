import { RecordedSession, SessionData } from "./session.types";

export interface ReplayEventsDependency<Key extends string> {
  key: Key;
  location: string;
}

export interface BaseReplayEventsDependencies {
  [key: ReplayEventsDependency<string>["key"]]: ReplayEventsDependency<string>;
}

export interface ReplayEventsDependencies extends BaseReplayEventsDependencies {
  browserUserInteractions: ReplayEventsDependency<"browserUserInteractions">;
  browserPlayback: ReplayEventsDependency<"browserPlayback">;
  browserUrlObserver: ReplayEventsDependency<"browserUrlObserver">;
  nodeBrowserContext: ReplayEventsDependency<"nodeBrowserContext">;
  nodeNetworkStubbing: ReplayEventsDependency<"nodeNetworkStubbing">;
  nodeUserInteractions: ReplayEventsDependency<"nodeUserInteractions">;
}

export interface ReplayEventsOptions {
  appUrl: string;
  browser: any;
  outputDir: string;
  session: RecordedSession;
  sessionData: SessionData;
  recordingId: string;
  meticulousSha: string;
  headless?: boolean;
  devTools?: boolean;
  bypassCSP?: boolean;
  verbose?: boolean;
  dependencies: ReplayEventsDependencies;
  screenshot?: boolean;
  screenshotSelector?: string;
  padTime: boolean;
  shiftTime: boolean;
  networkStubbing: boolean;
  moveBeforeClick: boolean;
  cookies: Record<string, any>[] | null;
  cookiesFile: string;
  accelerate: boolean;
}

export type ReplayEventsFn = (options: ReplayEventsOptions) => Promise<void>;

export interface Replay {
  id: string;
  [key: string]: any;
}
