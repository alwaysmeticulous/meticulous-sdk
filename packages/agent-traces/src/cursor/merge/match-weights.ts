/** Shorter prompts must match exactly; "yes" appears inside too many others. */
const MIN_CONTAINED_PROMPT_CHARS = 20;

/**
 * Transcripts name tools as the model called them, hooks sometimes by the
 * operation they perform (e.g. every edit is a `Write`).
 */
const TOOL_NAME_ALIASES: Record<string, string> = {
  strreplace: "write",
  edit: "write",
  multiedit: "write",
  applypatch: "write",
  editnotebook: "write",
  bash: "shell",
  runterminalcommand: "shell",
  runterminalcmd: "shell",
  readfile: "read",
  rg: "grep",
  ripgrep: "grep",
  glob: "list",
  ls: "list",
  deletefile: "delete",
  webfetch: "fetch",
  agent: "task",
  subagent: "task",
};

const TOOL_WEIGHT_SAME_NAME = 4;
const TOOL_WEIGHT_ALIAS = 3;
/** Lets differently named calls pair up when nothing better fits between them. */
const TOOL_WEIGHT_POSITION_ONLY = 1;

export const normalizeText = (text: string): string =>
  text.replace(/\s+/g, " ").trim();

export const promptsMatch = (
  transcriptText: string,
  prompt: string,
): boolean => {
  const a = normalizeText(transcriptText);
  const b = normalizeText(prompt);
  if (a.length === 0 || b.length === 0) {
    return false;
  }
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return (
    shorter === longer ||
    (shorter.length >= MIN_CONTAINED_PROMPT_CHARS && longer.includes(shorter))
  );
};

export const toolMatchWeight = (
  transcriptName: string,
  hookName: string,
): number => {
  if (transcriptName.toLowerCase() === hookName.toLowerCase()) {
    return TOOL_WEIGHT_SAME_NAME;
  }
  return canonicalToolName(transcriptName) === canonicalToolName(hookName)
    ? TOOL_WEIGHT_ALIAS
    : TOOL_WEIGHT_POSITION_ONLY;
};

export const canonicalToolName = (name: string): string => {
  const lower = name
    .toLowerCase()
    .replace(/^mcp:/, "")
    .replace(/[^a-z0-9]/g, "");
  return TOOL_NAME_ALIASES[lower] ?? lower;
};
