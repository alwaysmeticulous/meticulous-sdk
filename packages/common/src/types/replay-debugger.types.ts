import { SessionData } from "@alwaysmeticulous/api";
import { RecordedSession } from "./session.types";

export interface ReplayDebuggerDependency<Key extends string> {
  key: Key;
  location: string;
}

export interface ReplayDebuggerDependencies {
  browserUserInteractions: ReplayDebuggerDependency<"browserUserInteractions">;
  nodeBrowserContext: ReplayDebuggerDependency<"nodeBrowserContext">;
  nodeNetworkStubbing: ReplayDebuggerDependency<"nodeNetworkStubbing">;
}

export interface ReplayDebuggerOptions {
  session: RecordedSession;
  sessionData: SessionData;
  appUrl: string;
  devTools: boolean;
  dependencies: ReplayDebuggerDependencies;
  shiftTime: boolean;
  networkStubbing: boolean;
  moveBeforeMouseEvent: boolean;
  disableRemoteFonts: boolean;
  cookiesFile: string;
}

export type CreateReplayDebuggerFn = (
  options: ReplayDebuggerOptions
) => Promise<any>;
