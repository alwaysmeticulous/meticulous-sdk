// Whitespace and path/URL separators never appear in an opaque id (deployment
// id, commit SHA) but are exactly what a leaked error message or path contains.
const INVALID_OPAQUE_ID_CHARS = /[\s/\\:]/;

export const isOpaqueId = (value: string): boolean =>
  value.length > 0 && !INVALID_OPAQUE_ID_CHARS.test(value);

export const assertOpaqueId = (fieldName: string, value: string): void => {
  if (isOpaqueId(value)) {
    return;
  }
  throw new Error(
    `${fieldName} must be a single opaque token (no whitespace, "/", "\\" or ":"), got ${JSON.stringify(value)}. ` +
      `This usually means an error message or file path was passed through instead of the actual ${fieldName}.`,
  );
};
