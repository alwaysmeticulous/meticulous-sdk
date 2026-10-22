const MAX_TITLE_CHARS = 200;

/** The first non-blank line of a prompt, for agents that don't title sessions. */
export const titleFromPrompt = (prompt: string | null): string | null => {
  const firstLine = prompt
    ?.split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) {
    return null;
  }
  return firstLine.length > MAX_TITLE_CHARS
    ? `${firstLine.slice(0, MAX_TITLE_CHARS - 1)}…`
    : firstLine;
};
