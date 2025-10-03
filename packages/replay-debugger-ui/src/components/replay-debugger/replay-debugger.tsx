import cx from "classnames";
import {
  ButtonHTMLAttributes,
  DetailedHTMLProps,
  FunctionComponent,
  useCallback,
} from "react";
import { ReplayUserEvents } from "./user-events";
import { useReplayDebuggerContext } from "src/lib/replay-debugger/replay-debugger.context";
import { ReplayDebuggerProvider } from "src/lib/replay-debugger/replay-debugger.provider";

const ReplayDebuggerWrapped: FunctionComponent = () => {
  const { state, dispatchEvent } = useReplayDebuggerContext();
  const { events, index, loading } = state;

  const onCheckNextEventTarget = useCallback(() => {
    void dispatchEvent("check-next-target", null);
  }, [dispatchEvent]);

  const onPlayNextEvent = useCallback(() => {
    void dispatchEvent("play-next-event", null);
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
            <VioletButton onClick={onCheckNextEventTarget} disabled={loading}>
              {loading && <Spinner />} Check next event target
            </VioletButton>
            <VioletButton onClick={onPlayNextEvent} disabled={loading}>
              {loading && <Spinner />} Play next event
            </VioletButton>
          </div>
        </div>
      </div>

      <ReplayUserEvents />

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
              "sm:px-6",
              "select-none"
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
              "sm:px-6",
              "select-all"
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

const Spinner: FunctionComponent = () => (
  <svg
    className={cx("animate-spin", "-ml-1", "mr-3", "h-5", "w-5", "text-white")}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
  >
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    ></circle>
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    ></path>
  </svg>
);

const VioletButton: FunctionComponent<
  DetailedHTMLProps<ButtonHTMLAttributes<HTMLButtonElement>, HTMLButtonElement>
> = ({ children, className, ...otherProps }) => (
  <button
    type="button"
    {...otherProps}
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
      "bg-violet-600",
      "hover:bg-violet-700",
      "focus:outline-none",
      "focus:ring-2",
      "focus:ring-offset-2",
      "focus:ring-violet-500",
      className
    )}
  >
    {children}
  </button>
);
