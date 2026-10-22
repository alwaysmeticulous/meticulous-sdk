export type JsonRecord = Record<string, unknown>;

export const asRecord = (value: unknown): JsonRecord | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;

export const asString = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

export const asNonEmptyString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

export const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export const asArray = (value: unknown): unknown[] | null =>
  Array.isArray(value) ? value : null;
