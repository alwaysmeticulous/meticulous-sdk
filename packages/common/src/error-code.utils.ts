export function getErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const nodeError = error as { cause?: unknown; code?: unknown };
  if (typeof nodeError.code === "string") {
    return nodeError.code;
  }

  if (!nodeError.cause || typeof nodeError.cause !== "object") {
    return undefined;
  }

  const cause = nodeError.cause as { code?: unknown };
  return typeof cause.code === "string" ? cause.code : undefined;
}
