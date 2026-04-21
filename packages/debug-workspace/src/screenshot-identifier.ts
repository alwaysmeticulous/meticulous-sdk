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
