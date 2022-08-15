import {
  BaseReplayEventsDependencies,
  ReplayEventsDependency,
} from "./replay.types";
import { SessionData } from "./session.types";

export interface ReplayDebuggerDependencies
  extends BaseReplayEventsDependencies {
  replayDebugger: ReplayEventsDependency<"replayDebugger">;
  reanimator: ReplayEventsDependency<"reanimator">;
  replayNetworkFile: ReplayEventsDependency<"replayNetworkFile">;
}

export interface ReplayDebuggerOptions {
  sessionData: SessionData;
  appUrl: string;
  devTools: boolean;
  dependencies: ReplayDebuggerDependencies;
  shiftTime: boolean;
  networkStubbing: boolean;
  moveBeforeClick: boolean;
  cookiesFile: string;
}

export type CreateReplayDebuggerFn = (
  options: ReplayDebuggerOptions
) => Promise<any>;
