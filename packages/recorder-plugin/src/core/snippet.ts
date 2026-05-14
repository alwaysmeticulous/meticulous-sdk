import type { ResolvedOptions, ScriptAttributeValue } from "../types";

const escapeAttributeValue = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const isValidAttributeName = (name: string): boolean =>
  /^[A-Za-z_:][-A-Za-z0-9_.:]*$/.test(name);

const formatAttribute = (
  name: string,
  value: ScriptAttributeValue,
): string | null => {
  if (value === false || value === null || value === undefined) {
    return null;
  }
  if (!isValidAttributeName(name)) {
    return null;
  }
  if (value === true) {
    return name;
  }
  return `${name}="${escapeAttributeValue(value)}"`;
};

export interface BuildScriptTagContext {
  /** Whether the current build is a production build. */
  isProduction: boolean;
}

/**
 * Build the `<script>` tag that loads the Meticulous recorder.
 *
 * Defaults emitted on the tag:
 * - `data-recording-token` — from {@link ResolvedOptions.recordingToken}.
 * - `src` — from {@link ResolvedOptions.snippetUrl}.
 * - `data-is-production-environment` — `"true"` / `"false"` based on
 *   {@link BuildScriptTagContext.isProduction}. This matches the Meticulous
 *   docs recommendation; non-production environments (localhost, staging,
 *   preview) will be tagged as such automatically.
 *
 * Any user-supplied {@link ResolvedOptions.attributes} are merged on top, so
 * callers can override the defaults (including
 * `data-is-production-environment`) if they need bespoke behaviour.
 */
export const buildScriptTag = (
  options: ResolvedOptions,
  ctx: BuildScriptTagContext,
): string => {
  const baseAttributes: Record<string, ScriptAttributeValue> = {
    "data-recording-token": options.recordingToken,
    "data-is-production-environment": ctx.isProduction ? "true" : "false",
    src: options.snippetUrl,
  };

  const merged: Record<string, ScriptAttributeValue> = {
    ...baseAttributes,
    ...options.attributes,
  };

  const parts: string[] = [];
  for (const [name, value] of Object.entries(merged)) {
    const attr = formatAttribute(name, value);
    if (attr !== null) {
      parts.push(attr);
    }
  }

  return `<script ${parts.join(" ")}></script>`;
};
