export interface ScreenshotIdentifier {
  type?: string;
  eventNumber?: number;
  logicVersion?: number | null;
  variant?: string | null;
}

/**
 * Single source of truth for the on-disk screenshot basename (no extension)
 * derived from a timeline/screenshot `identifier` object.
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
 * Name accepted by the backend's replay-diff screenshot endpoints — differs
 * from the on-disk basename: no zero-padding, no `logicVersion` suffix, and
 * `end-state` instead of `final-state`. Returns `null` for redacted variants
 * (backend naming unverified) and unknown types.
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
