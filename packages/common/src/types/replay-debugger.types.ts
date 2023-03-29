import { SessionData } from "@alwaysmeticulous/api";
import { RecordedSession } from "./session.types";

export interface ReplayDebuggerDependendy<Key extends string> {
  key: Key;
  location: string;
}

export interface ReplayDebuggerDependencies {
  browserUserInteractions: ReplayDebuggerDependendy<"browserUserInteractions">;
  nodeBrowserContext: ReplayDebuggerDependendy<"nodeBrowserContext">;
  nodeNetworkStubbing: ReplayDebuggerDependendy<"nodeNetworkStubbing">;
}

export interface ReplayDebuggerOptions {
  session: RecordedSession;
  sessionData: SessionData;
  appUrl: string;
  devTools: boolean;
  dependencies: ReplayDebuggerDependencies;
  shiftTime: boolean;
  networkStubbing: boolean;
  moveBeforeClick: boolean;
  disableRemoteFonts: boolean;
  cookiesFile: string;
}

export type CreateReplayDebuggerFn = (
  options: ReplayDebuggerOptions
) => Promise<any>;
