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

/**
 * Build the `<script>` tag that loads the Meticulous recorder.
 *
 * The token is emitted as `data-recording-token` and the snippet URL becomes
 * `src`. Custom attributes from {@link ResolvedOptions.attributes} are
 * appended; if a custom attribute collides with `src` or
 * `data-recording-token` the user-supplied value wins so callers can override
 * defaults if they need to.
 */
export const buildScriptTag = (options: ResolvedOptions): string => {
  const baseAttributes: Record<string, ScriptAttributeValue> = {
    "data-recording-token": options.recordingToken,
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
