/** Pretty-prints a value using the shared CLI and MCP JSON representation. */
export const serializeJson = (value: unknown): string =>
  JSON.stringify(value, null, 2) ?? "null";
