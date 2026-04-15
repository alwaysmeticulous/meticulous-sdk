export function getErrorCode(error: unknown): string | undefined {
  return getNestedErrorCode(error, new Set());
}

function getNestedErrorCode(
  error: unknown,
  visited: Set<object>,
): string | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  if (visited.has(error)) {
    return undefined;
  }
  visited.add(error);

  const nodeError = error as { cause?: unknown; code?: unknown };
  const nestedCode = getNestedErrorCode(nodeError.cause, visited);
  if (nestedCode) {
    return nestedCode;
  }

  return typeof nodeError.code === "string" ? nodeError.code : undefined;
}
