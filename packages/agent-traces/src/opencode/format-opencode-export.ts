export const formatOpenCodeExport = (exported: unknown): string =>
  `${JSON.stringify(exported, null, 2)}\n`;
