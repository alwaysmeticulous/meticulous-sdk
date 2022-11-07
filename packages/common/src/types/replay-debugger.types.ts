import {
  BaseReplayEventsDependencies,
  ReplayEventsDependency,
} from "./replay.types";
import { RecordedSession, SessionData } from "./session.types";

export interface ReplayDebuggerDependencies
  extends BaseReplayEventsDependencies {
  browserUserInteractions: ReplayEventsDependency<"browserUserInteractions">;
  nodeBrowserContext: ReplayEventsDependency<"nodeBrowserContext">;
  nodeNetworkStubbing: ReplayEventsDependency<"nodeNetworkStubbing">;
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
