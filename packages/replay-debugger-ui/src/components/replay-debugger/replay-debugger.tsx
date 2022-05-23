import cx from "classnames";
import { FunctionComponent, useCallback } from "react";
import { useReplayDebuggerContext } from "src/lib/replay-debugger/replay-debugger.context";
import { ReplayDebuggerProvider } from "src/lib/replay-debugger/replay-debugger.provider";

const ReplayDebuggerWrapped: FunctionComponent = () => {
  const { state, dispatchEvent } = useReplayDebuggerContext();
  const { events, index, loading } = state;

  const onCheckNextEventTarget = useCallback(() => {
    dispatchEvent("check-next-target", null);
  }, [dispatchEvent]);

  const onPlayNextEvent = useCallback(() => {
    dispatchEvent("play-next-event", null);
  }, [dispatchEvent]);

  return (
    <div className="min-h-screen">
      <div
        className={cx(
          "w-full",
          "mx-auto",
          "sm:max-w-xl",
          "sm:px-6",
          "sm:py-4",
          "lg:px-8"
        )}
      >
        <div
          className={cx(
            "bg-white",
            "overflow-hidden",
            "mx-auto",
            "shadow",
            "sm:rounded-lg"
          )}
        >
          <div
            className={cx(
              "flex",
              "flex-col",
              "justify-between",
              "space-y-4",
              "px-4",
              "py-5",
              "sm:flex-row",
              "sm:space-x-4",
              "sm:space-y-0",
              "sm:p-6"
            )}
          >
            <button
              type="button"
              className={cx(
                "flex-grow",
                "inline-flex",
                "items-center",
                "justify-center",
                "px-4",
                "py-2",
                "border",
                "border-transparent",
                "text-sm",
                "font-medium",
                "rounded-md",
                "shadow-sm",
                "text-white",
                "bg-indigo-600",
                "hover:bg-indigo-700",
                "focus:outline-none",
                "focus:ring-2",
                "focus:ring-offset-2",
                "focus:ring-indigo-500"
              )}
              onClick={onCheckNextEventTarget}
              disabled={loading}
            >
              Check next event target
            </button>
            <button
              type="button"
              className={cx(
                "flex-grow",
                "inline-flex",
                "items-center",
                "justify-center",
                "px-4",
                "py-2",
                "border",
                "border-transparent",
                "text-sm",
                "font-medium",
                "rounded-md",
                "shadow-sm",
                "text-white",
                "bg-indigo-600",
                "hover:bg-indigo-700",
                "focus:outline-none",
                "focus:ring-2",
                "focus:ring-offset-2",
                "focus:ring-indigo-500"
              )}
              onClick={onPlayNextEvent}
              disabled={loading}
            >
              Play next event
            </button>
          </div>
        </div>
      </div>
      <div
        className={cx(
          "mt-4",
          "w-full",
          "mx-auto",
          "sm:mt-0",
          "sm:max-w-xl",
          "sm:px-6",
          "sm:py-4",
          "lg:px-8"
        )}
      >
        <div
          className={cx(
            "bg-white",
            "overflow-hidden",
            "mx-auto",
            "shadow",
            "sm:rounded-lg"
          )}
        >
          <div
            className={cx(
              "px-4",
              "py-5",
              "border-b",
              "border-zinc-200",
              "sm:px-6"
            )}
          >
            <h3
              className={cx(
                "text-lg",
                "leading-6",
                "font-medium",
                "text-zinc-900"
              )}
            >
              Replay debugger state
            </h3>
          </div>
          <pre
            className={cx(
              "overflow-auto",
              "h-[80vh]",
              "max-h-[48rem]",
              "px-4",
              "py-5",
              "bg-zinc-100",
              "text-zinc-900",
              "font-mono",
              "sm:px-6"
            )}
          >
            <code className="language-json">
              {JSON.stringify({ loading, index, events }, null, 2)}
            </code>
          </pre>
        </div>
      </div>
    </div>
  );
};

export const ReplayDebugger: FunctionComponent = () => {
  return (
    <ReplayDebuggerProvider>
      <ReplayDebuggerWrapped />
    </ReplayDebuggerProvider>
  );
};
