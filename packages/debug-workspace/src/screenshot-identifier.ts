export interface ScreenshotIdentifier {
  type?: string;
  eventNumber?: number;
  logicVersion?: number | null;
  variant?: string | null;
}

/**
 * Canonical mapping from a timeline/screenshot `identifier` object to
 * the basename used on disk (without extension).
 *
 * This is the single source of truth for screenshot naming. To get the
 * `.png` filename, use `screenshotIdentifierToFilename`, which just
 * appends `".png"` to this result.
 */
export const screenshotIdentifierToBaseName = (
  identifier: ScreenshotIdentifier,
): string | null => {
  const variantPortion = identifier.variant === "redacted" ? ".redacted" : "";

  if (identifier.type === "end-state") {
    return identifier.logicVersion == null
      ? `final-state${variantPortion}`
      : `final-state-v${identifier.logicVersion}${variantPortion}`;
  }

  if (identifier.type === "after-event" && identifier.eventNumber != null) {
    const eventIndexStr = identifier.eventNumber.toString().padStart(5, "0");
    return identifier.logicVersion == null
      ? `screenshot-after-event-${eventIndexStr}${variantPortion}`
      : `screenshot-after-event-${eventIndexStr}-v${identifier.logicVersion}${variantPortion}`;
  }

  return null;
};

export const screenshotIdentifierToFilename = (
  identifier: ScreenshotIdentifier,
): string | undefined => {
  const baseName = screenshotIdentifierToBaseName(identifier);
  return baseName == null ? undefined : `${baseName}.png`;
};

/**
 * Serialize a screenshot identifier to the form accepted by the
 * Meticulous backend's replay-diff screenshot endpoints (e.g.
 * `GET /agent/replay-diffs/:id/screenshots/:name/dom-diff`).
 *
 * This differs from the on-disk basename:
 *   - `{ type: "after-event", eventNumber: 164 }`
 *     → on-disk `screenshot-after-event-00164`, backend `after-event-164`
 *   - `{ type: "end-state", logicVersion: 2 }`
 *     → on-disk `final-state-v2`, backend `end-state`
 *
 * `logicVersion` is intentionally dropped: the backend addresses
 * screenshots by their logical identity (type + eventNumber) and
 * resolves logic versions internally. Passing `end-state-v2` or
 * `after-event-164-v2` returns 404.
 *
 * Returns `null` for the `variant: "redacted"` case: the naming
 * convention for redacted screenshots via these endpoints is not
 * verified, so callers should skip those rather than risk 404s.
 */
export const screenshotIdentifierToBackendName = (
  identifier: ScreenshotIdentifier,
): string | null => {
  if (identifier.variant === "redacted") {
    return null;
  }
  if (identifier.type === "end-state") {
    return "end-state";
  }
  if (identifier.type === "after-event" && identifier.eventNumber != null) {
    return `after-event-${identifier.eventNumber}`;
  }
  return null;
};
