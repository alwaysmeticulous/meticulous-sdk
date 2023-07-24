/**
 * logs.ndjson contains one ConsoleMessageWithStackTracePointer in JSON format per line
 */
export type ConsoleMessageWithStackTracePointer =
  | MeticulousConsoleMessage
  | ApplicationConsoleMessage
  | VirtualTimeChange;

export interface VirtualTimeChange {
  type: "virtual-time-change";
  virtualTime: number;
}

export interface MeticulousConsoleMessage extends ConsoleMessageCoreData {
  source: "meticulous";
  realTime: number;
}

export interface ApplicationConsoleMessage extends ConsoleMessageCoreData {
  source: "application";
  // Note: we don't store real times for application messages, only meticulous ones, yet
  // (to get an accurate real time we'd have to override console.log etc., and snapshot performance.now() at the time of the call)
}

export interface ConsoleMessageCoreData {
  type: ConsoleMessageType;
  message: string;
  repetitionCount?: number;
  stackTraceId: number;
}

export type ConsoleMessageType =
  | "log"
  | "debug"
  | "info"
  | "error"
  | "warning"
  | "dir"
  | "dirxml"
  | "table"
  | "trace"
  | "clear"
  | "startGroup"
  | "startGroupCollapsed"
  | "endGroup"
  | "assert"
  | "profile"
  | "profileEnd"
  | "count"
  | "timeEnd"
  | "verbose";

export interface ConsoleMessageLocation {
  /**
   * URL of the resource if known or `undefined` otherwise.
   */
  url?: string;
  /**
   * 0-based line number in the resource if known or `undefined` otherwise.
   */
  lineNumber?: number;
  /**
   * 0-based column number in the resource if known or `undefined` otherwise.
   */
  columnNumber?: number;
}
