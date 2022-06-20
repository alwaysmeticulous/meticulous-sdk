import { RecordedSession, SessionData } from "./session.types";

export interface ReplayEventsDependency<Key extends string> {
  key: Key;
  location: string;
}

export interface BaseReplayEventsDependencies {
  [key: ReplayEventsDependency<string>["key"]]: ReplayEventsDependency<string>;
}

export interface ReplayEventsDependencies extends BaseReplayEventsDependencies {
  reanimator: ReplayEventsDependency<"reanimator">;
  replayNetworkFile: ReplayEventsDependency<"replayNetworkFile">;
  jsReplay: ReplayEventsDependency<"jsReplay">;
  rrweb: ReplayEventsDependency<"rrweb">;
}

export interface ReplayEventsOptions {
  appUrl: string;
  browser: any;
  tempDir: string;
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
  networkStubbing: boolean;
  moveBeforeClick: boolean;
  cookies: Record<string, any>[] | null;
  cookiesFile: string;
}

export type ReplayEventsFn = (options: ReplayEventsOptions) => Promise<{
  eventsFinishedPromise: Promise<void>;
  writesFinishedPromise: Promise<void>;
}>;
