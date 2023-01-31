import {
  ArrowDownTrayIcon,
  // CursorClickIcon,
  // DownloadIcon,
  // FastForwardIcon,
  // FingerPrintIcon,
  // PencilAltIcon,
  // PlayIcon,
  // ReplyIcon,
  // SwitchVerticalIcon,
  // UploadIcon,
  // XIcon,
  ArrowsUpDownIcon,
  ArrowUpTrayIcon,
  ArrowUturnLeftIcon,
  CursorArrowRaysIcon,
  FingerPrintIcon,
  ForwardIcon,
  PencilSquareIcon,
  PlayIcon,
  XMarkIcon,
} from "@heroicons/react/20/solid";
import cx from "classnames";
import { Duration } from "luxon";
import { FunctionComponent, useCallback, useEffect, useRef } from "react";
import { ReplayableEvent } from "src/lib/event/event.types";
import { useReplayDebuggerContext } from "src/lib/replay-debugger/replay-debugger.context";

interface EventListItemProps {
  event: ReplayableEvent;
  index: number;
  current?: boolean;
}

const EventListItem: FunctionComponent<EventListItemProps> = ({
  event,
  index,
  current,
}) => {
  const { state, dispatchEvent } = useReplayDebuggerContext();
  const { loading } = state;

  const { type: eventType, timeStamp } = event;

  const timeTick = Duration.fromMillis(timeStamp);

  const Icon = (() => {
    switch (eventType) {
      case "scroll":
        return ArrowsUpDownIcon;
      case "focusin":
      case "focus":
        return ArrowDownTrayIcon;
      case "focusout":
      case "blur":
        return ArrowUpTrayIcon;
      case "tap":
      case "click":
      case "mouseup":
      case "mousedown":
        return CursorArrowRaysIcon;
      case "touchstart":
      case "touchend":
      case "touchmove":
      case "touchcancel":
        return FingerPrintIcon;
      case "keypress":
      case "keydown":
      case "keyup":
      case "input":
        return PencilSquareIcon;
      default:
        return null;
    }
  })();

  const ref = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (current) {
      ref.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    }
  }, [current]);

  const onPlayNextEvent = useCallback(() => {
    dispatchEvent("play-next-event", null);
  }, [dispatchEvent]);

  const onSetIndex = useCallback(() => {
    dispatchEvent("set-index", { index });
  }, [dispatchEvent, index]);

  return (
    <li
      className={cx(
        "p-4",
        "sm:px-6",
        "flex",
        "items-baseline",
        "snap-center",
        "ring-2",
        "ring-inset",
        current && "bg-violet-100/50",
        current ? "ring-violet-500" : "ring-transparent"
      )}
      ref={ref}
    >
      <div
        className={cx(
          "p-2",
          "self-center",
          "rounded-full",
          "shadow-sm",
          "bg-violet-200",
          "text-violet-800"
        )}
      >
        {Icon && <Icon className={cx("w-5", "h-5")} aria-hidden="true" />}
        {!Icon && (
          <div
            className={cx(
              "w-5",
              "h-5",
              "flex",
              "justify-center",
              "items-center",
              "text-base",
              "font-bold"
            )}
            aria-hidden="true"
          >
            <span>?</span>
          </div>
        )}
      </div>
      <div className={cx("ml-2", "self-center")}>
        {current && (
          <button
            type="button"
            className={cx(
              "inline-flex",
              "items-center",
              "p-1",
              "border",
              "border-transparent",
              "rounded-full",
              "shadow-sm",
              "text-white",
              "bg-violet-600",
              "hover:bg-violet-700",
              "focus:outline-none",
              "focus:ring-2",
              "focus:ring-offset-2",
              "focus:ring-violet-500"
            )}
            onClick={onPlayNextEvent}
            disabled={loading}
            title="Play this event"
          >
            <span className="sr-only">Play this event</span>
            <PlayIcon className={cx("w-5", "h-5")} aria-hidden="true" />
          </button>
        )}
        {!current && (
          <button
            type="button"
            className={cx(
              "inline-flex",
              "items-center",
              "p-1",
              "border",
              "border-zinc-300",
              "rounded-full",
              "shadow-sm",
              "text-zinc-700",
              "hover:bg-zinc-50",
              "hover:border-zinc-700",
              "focus:outline-none",
              "focus:ring-2",
              "focus:ring-offset-2",
              "focus:ring-violet-500"
            )}
            onClick={onSetIndex}
            disabled={loading}
            title="Jump to this event"
          >
            <span className="sr-only">Jump to this event</span>
            <ArrowUturnLeftIcon
              className={cx("w-5", "h-5", "-scale-x-100", "rotate-90")}
              aria-hidden="true"
            />
          </button>
        )}
      </div>
      <div className={cx("ml-2", "my-auto", "flex-1")}>{eventType}</div>
      <div className={cx("my-auto", "text-sm", "font-medium", "text-zinc-600")}>
        <time dateTime={timeTick.toISO()}>
          {timeTick.toFormat("mm:ss.SSS")}
        </time>
      </div>
    </li>
  );
};

const EndOfReplayItem: FunctionComponent<{ current?: boolean }> = ({
  current,
}) => {
  const { state, dispatchEvent } = useReplayDebuggerContext();
  const { loading } = state;

  const onReset = useCallback(() => {
    dispatchEvent("set-index", { index: 0 });
  }, [dispatchEvent]);

  return (
    <li
      className={cx(
        "p-4",
        "sm:px-6",
        "flex",
        "items-baseline",
        "snap-center",
        "ring-2",
        "ring-inset",
        current && "bg-violet-100/50",
        current ? "ring-violet-500" : "ring-transparent"
      )}
    >
      <div
        className={cx(
          "p-2",
          "self-center",
          "rounded-full",
          "shadow-sm",
          "bg-violet-200",
          "text-violet-800"
        )}
      >
        <XMarkIcon className={cx("w-5", "h-5")} aria-hidden="true" />
      </div>
      <div className={cx("ml-2", "self-center")}>
        <button
          type="button"
          className={cx(
            "inline-flex",
            "items-center",
            "p-1",
            "border",
            current ? "border-transparent" : "border-zinc-300",
            "rounded-full",
            "shadow-sm",
            current ? "text-white" : "text-zinc-300",
            current ? "bg-violet-600" : "bg-zinc-100",
            current && "hover:bg-violet-700",
            "focus:outline-none",
            "focus:ring-2",
            "focus:ring-offset-2",
            "focus:ring-violet-500",
            !current && "cursor-not-allowed"
          )}
          onClick={onReset}
          disabled={loading || !current}
          title="Jump to first event"
        >
          <span className="sr-only">Jump to first event</span>
          <ForwardIcon
            className={cx("w-5", "h-5", "rotate-180")}
            aria-hidden="true"
          />
        </button>
      </div>
      <div className={cx("ml-2", "my-auto", "flex-1")}>End of replay</div>
    </li>
  );
};

export const ReplayUserEvents: FunctionComponent = () => {
  const { state } = useReplayDebuggerContext();
  const { events, index } = state;

  if (!events) {
    return null;
  }

  const currentEvent = events[index ?? -1] || null;

  return (
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
            User events
          </h3>
        </div>
        <ol
          role="list"
          className={cx(
            "relative",
            "h-full",
            "max-h-96",
            "overflow-y-auto",
            "divide-y",
            "divide-zinc-100",
            "snap-y",
            "scroll-py-2"
          )}
        >
          {events.map((event, idx) => (
            <EventListItem
              key={idx}
              event={event}
              index={idx}
              current={idx === index}
            />
          ))}
          <EndOfReplayItem current={index === events.length} />
        </ol>
        <div
          className={cx(
            "px-4",
            "py-5",
            "border-t",
            "border-zinc-200",
            "bg-zinc-100",
            "sm:px-6"
          )}
        >
          <h4
            className={cx(
              "leading-6",
              "text-base",
              "font-medium",
              "text-zinc-900"
            )}
          >
            Event data
          </h4>
          <pre
            className={cx(
              "max-h-64",
              "overflow-auto",
              "text-zinc-900",
              "font-mono"
            )}
          >
            <code>
              {currentEvent && JSON.stringify(currentEvent, null, 2)}
              {!currentEvent && <>{"<no event>"}</>}
            </code>
          </pre>
        </div>
      </div>
    </div>
  );
};
