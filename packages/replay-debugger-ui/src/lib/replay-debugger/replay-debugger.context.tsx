import { createContext, useContext } from "react";
import { ReplayableEvent } from "../event/event.types";

export interface ReplayDebuggerState<T = ReplayableEvent> {
  events: T[] | null;
  index: number | null;
  loading: boolean;
}

export type DispatchEvent = (
  eventType: string,
  eventData: any
) => Promise<void>;

export interface ReplayDebuggerContextType<T = ReplayableEvent> {
  state: ReplayDebuggerState<T>;
  dispatchEvent: DispatchEvent;
}

export const ReplayDebuggerContext =
  createContext<ReplayDebuggerContextType | null>(null);

export const useReplayDebuggerContext: () => ReplayDebuggerContextType = () => {
  const context = useContext(ReplayDebuggerContext);

  if (!context) {
    throw new Error(
      "useReplayDebuggerContext() must be used within a <ReplayDebuggerProvider> component"
    );
  }

  return context;
};
