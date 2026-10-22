import type { JsonRecord } from "../utils/json-guards";

/** One hook invocation, as `agent-traces-plugin/bin/hook.sh` spools it. */
export interface SpooledHookEvent {
  /** The event the hook script ran for, e.g. `PostToolUse`. */
  event: string;
  /** The agent's project directory when the hook ran, if it exposes one. */
  projectDir: string | null;
  /** The hook's working directory. */
  cwd: string | null;
  /** The agent's stdin payload, or null when it wasn't a JSON object. */
  payload: JsonRecord | null;
}

export interface TimedSpooledEvent {
  /** Null when the spooled file couldn't be parsed. */
  event: SpooledHookEvent | null;
  /** ISO 8601, from when hook.sh wrote the file. */
  timestamp: string;
}
