/** Applies to the ATIF only; the raw upload keeps the full content. */
export const MAX_OBSERVATION_CONTENT_CHARS = 256 * 1024;

interface TruncatedContent {
  content: string;
  originalLength: number | null;
}

export const truncateObservationContent = (
  content: string,
): TruncatedContent => {
  if (content.length <= MAX_OBSERVATION_CONTENT_CHARS) {
    return { content, originalLength: null };
  }
  return {
    content: `${content.slice(0, MAX_OBSERVATION_CONTENT_CHARS)}\n[truncated]`,
    originalLength: content.length,
  };
};
