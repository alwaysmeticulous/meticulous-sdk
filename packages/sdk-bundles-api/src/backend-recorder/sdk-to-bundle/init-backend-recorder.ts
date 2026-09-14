/**
 * Transforms one redactable string from a completed backend span before that span is saved.
 * Hooks run in array order and must return a string.
 *
 * `jsonPath` locates the string within the serialized span, so a hook can tell a database
 * query's serialized arguments from a URL or a header value and redact each appropriately —
 * rewriting serialized JSON with text substitutions risks emitting something that no longer
 * parses, which silently breaks mock matching at replay time.
 */
export type BackendRecorderSpanRedactionHook = (
  value: string,
  jsonPath: readonly string[],
) => string;

export interface BackendRecorderConfig {
  /** Enable/disable the recorder. Defaults to `true`. */
  enabled?: boolean;
  /** The name of the Meticulous project. */
  meticulousProjectName?: string;
  /** Token used to authenticate span uploads. */
  recordingToken?: string;
  /** Where to export spans. Defaults to `"local"`. */
  exportMode?: "local" | "s3";
  /** Directory for local exports. Only used when `exportMode` is `"local"`. */
  localOutputDir?: string;
  /** How often to flush spans, in milliseconds. */
  flushIntervalMs?: number;
  /**
   * Record-mode hooks applied in order to every redactable string in a span before it is saved.
   * Span and trace IDs, timestamps, technology routing, frontend session IDs, and attribute names
   * are not transformed. If a hook throws or returns a non-string, recording is abandoned rather
   * than saving the span without redaction.
   */
  spanRedactionHooks?: readonly BackendRecorderSpanRedactionHook[];
}
