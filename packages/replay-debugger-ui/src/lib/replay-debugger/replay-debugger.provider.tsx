import { FunctionComponent, ReactNode, useEffect, useState } from "react";
import {
  DispatchEvent,
  ReplayDebuggerContext,
  ReplayDebuggerState,
} from "./replay-debugger.context";

export const ReplayDebuggerProvider: FunctionComponent<{
  children?: ReactNode;
}> = ({ children }) => {
  const [state, setState] = useState<ReplayDebuggerState>({
    events: null,
    index: null,
    loading: true,
  });
  const [dispatchEvent, setDispatchEvent] = useState<DispatchEvent | null>(
    null
  );

  useEffect(() => {
    (window as any).__meticulous__replayDebuggerSetState = setState;
    const dispatchEvent = (window as any)
      .__meticulous__replayDebuggerDispatchEvent;
    if (!dispatchEvent) {
      console.error("No dispatchEvent() function defined!");
      return;
    }
    setDispatchEvent(() => dispatchEvent);
  }, []);

  useEffect(() => {
    if (dispatchEvent) {
      dispatchEvent("ready", null);
    }
  }, [dispatchEvent]);

  if (!dispatchEvent) {
    return null;
  }

  return (
    <ReplayDebuggerContext.Provider value={{ state, dispatchEvent }}>
      {children}
    </ReplayDebuggerContext.Provider>
  );
};
