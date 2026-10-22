import { asNumber, asRecord } from "../utils/json-guards";

/** Exec tools put the exit code in a short header before the output. */
const HEADER_CHARS = 512;
const EXIT_CODE_PATTERNS = [
  /^Process exited with code (-?\d+)$/m,
  /^Exit code: (-?\d+)$/m,
];

/**
 * A fallback for when no `item_completed` event recorded the call's status
 * (older rollouts, or tools that don't emit one).
 */
export const outputLooksFailed = (content: string): boolean => {
  const header = content.slice(0, HEADER_CHARS);
  for (const pattern of EXIT_CODE_PATTERNS) {
    const code = pattern.exec(header)?.[1];
    if (code !== undefined) {
      return Number(code) !== 0;
    }
  }
  return legacyShellExitCode(content) !== 0;
};

/** Older `shell` tool outputs were `{"output": …, "metadata": {"exit_code": …}}`. */
const legacyShellExitCode = (content: string): number => {
  if (!content.startsWith("{")) {
    return 0;
  }
  try {
    const parsed = asRecord(JSON.parse(content));
    return asNumber(asRecord(parsed?.["metadata"])?.["exit_code"]) ?? 0;
  } catch {
    return 0;
  }
};
